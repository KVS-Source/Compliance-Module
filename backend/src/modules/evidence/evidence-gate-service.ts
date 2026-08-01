import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import {
  coverageIncompleteReason,
  policyCoverageReason,
  type EvidenceGateFailureReason,
  type KpiEvidenceGateReason,
  type PolicyEvidenceGateReason,
  utcDateString,
  type UtcDateString,
} from "./eligibility.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Parameterized `IN (...)` list of UUIDs for Prisma `$queryRaw`. */
const uuidInList = (ids: string[]) =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

export type CheckpointGateResult = {
  satisfied: true;
  qualifyingCount: number;
  /** Locked qualifying Evidence id (present when evidenceRequired and satisfied). */
  lockedEvidenceId?: string;
};

export type PolicyGateResult = {
  satisfied: true;
  requiredControlCount: number;
  requiredCheckpointCount: number;
  coveredControlCount: number;
  coveredCheckpointCount: number;
};

/**
 * Central Evidence gate evaluation.
 *
 * Checkpoint: real coverage against active APPROVED Evidence links, with a
 * narrow `FOR SHARE` row lock on one qualifying Evidence row.
 * Policy Version approval: multi-target Control/Checkpoint coverage with
 * independent requirements and multi-row FOR SHARE locks.
 * KPI Actual approval: exact-target EvidenceKpiActualLink coverage with
 * FOR SHARE on one qualifying Evidence row.
 */
export class EvidenceGateService {
  constructor(private readonly db?: PrismaClient) {}

  /**
   * @deprecated KPI production paths use assertKpiActualApprovalSatisfied.
   * Retained only for legacy unit tests that assert historical 501 behaviour.
   */
  assertSatisfied(requiresEvidence: boolean): true {
    if (requiresEvidence) {
      throw new AppError(
        501,
        "EVIDENCE_GATE_NOT_IMPLEMENTED",
        "KPI actual approval requires evidence support that is not implemented",
      );
    }
    return true;
  }

  /**
   * KPI Actual approval gate (Slice 5D).
   * requiresEvidence=false short-circuits. When true, requires ≥1 active
   * exact-target link to qualifying APPROVED Evidence and locks one row
   * with FOR SHARE OF e until the parent transaction ends.
   */
  async assertKpiActualApprovalSatisfied(input: {
    tenantId: string;
    kpiActualId: string;
    requiresEvidence: boolean;
    asOfDate?: UtcDateString;
    tx?: Prisma.TransactionClient;
  }): Promise<{
    satisfied: true;
    qualifyingCount: number;
    lockedEvidenceId?: string;
  }> {
    if (!input.requiresEvidence) {
      return { satisfied: true, qualifyingCount: 0 };
    }

    const client = this.requireClient(input.tx);
    const asOfDate = input.asOfDate ?? utcDateString();

    const activeLinkCount = await client.evidenceKpiActualLink.count({
      where: {
        tenantId: input.tenantId,
        kpiActualId: input.kpiActualId,
        isActive: true,
      },
    });
    if (activeLinkCount === 0) {
      this.throwKpiEvidenceRequired("EVIDENCE_KPI_LINK_REQUIRED");
    }

    const lockedEvidenceId = await this.lockOneQualifyingKpiActualEvidence(
      client,
      input.tenantId,
      input.kpiActualId,
      asOfDate,
    );
    if (!lockedEvidenceId) {
      this.throwKpiEvidenceRequired("EVIDENCE_KPI_COVERAGE_INCOMPLETE");
    }

    return {
      satisfied: true,
      qualifyingCount: 1,
      lockedEvidenceId,
    };
  }

  /**
   * Checkpoint review gate. When evidenceRequired is false, passes immediately.
   * When true, finds one qualifying Evidence, locks it (`FOR SHARE OF e`) for
   * the remainder of the parent transaction, then returns success.
   */
  async assertCheckpointReviewSatisfied(input: {
    tenantId: string;
    checkpointId: string;
    evidenceRequired: boolean;
    asOfDate?: UtcDateString;
    tx?: Prisma.TransactionClient;
  }): Promise<CheckpointGateResult> {
    if (!input.evidenceRequired) {
      return { satisfied: true, qualifyingCount: 0 };
    }

    const client = this.requireClient(input.tx);
    const asOfDate = input.asOfDate ?? utcDateString();
    const lockedEvidenceId = await this.lockOneQualifyingCheckpointEvidence(
      client,
      input.tenantId,
      input.checkpointId,
      asOfDate,
    );

    if (!lockedEvidenceId) {
      this.throwCoverageIncomplete(coverageIncompleteReason());
    }

    return {
      satisfied: true,
      qualifyingCount: 1,
      lockedEvidenceId,
    };
  }

  /**
   * Policy Version approval gate (Slice 5.5C).
   * requiresEvidence=false short-circuits. When true, evaluates exact-version
   * Control and Checkpoint requirements independently and locks selected
   * qualifying Evidence rows until the parent approval transaction ends.
   */
  async assertPolicyVersionApprovalSatisfied(input: {
    tenantId: string;
    policyVersionId: string;
    requiresEvidence: boolean;
    asOfDate?: UtcDateString;
    tx?: Prisma.TransactionClient;
  }): Promise<PolicyGateResult> {
    if (!input.requiresEvidence) {
      return {
        satisfied: true,
        requiredControlCount: 0,
        requiredCheckpointCount: 0,
        coveredControlCount: 0,
        coveredCheckpointCount: 0,
      };
    }

    const client = this.requireClient(input.tx);
    const asOfDate = input.asOfDate ?? utcDateString();

    const targets = await this.resolveAndLockPolicyTargets(
      client,
      input.tenantId,
      input.policyVersionId,
    );

    const requiredControlIds = targets.requiredControlIds;
    const requiredCheckpointIds = targets.requiredCheckpointIds;

    if (
      requiredControlIds.length === 0 &&
      requiredCheckpointIds.length === 0
    ) {
      this.throwPolicyEvidenceRequired("EVIDENCE_GATE_NOT_CONFIGURED");
    }

    const coveredControls = await this.lockQualifyingEvidenceForControls(
      client,
      input.tenantId,
      requiredControlIds,
      asOfDate,
    );
    const coveredCheckpoints = await this.lockQualifyingEvidenceForCheckpoints(
      client,
      input.tenantId,
      requiredCheckpointIds,
      asOfDate,
    );

    // Deduplicated Evidence FOR SHARE in global ID order (selected sets may overlap).
    const allEvidenceIds = [
      ...new Set([
        ...coveredControls.evidenceIds,
        ...coveredCheckpoints.evidenceIds,
      ]),
    ].sort();
    if (allEvidenceIds.length > 0) {
      const lockedIds = await this.lockEvidenceRowsById(
        client,
        input.tenantId,
        allEvidenceIds,
      );
      // If archive won between select and lock, locked set shrinks → recheck.
      if (lockedIds.length < allEvidenceIds.length) {
        const coveredControlsAfter = await this.lockQualifyingEvidenceForControls(
          client,
          input.tenantId,
          requiredControlIds,
          asOfDate,
        );
        const coveredCheckpointsAfter =
          await this.lockQualifyingEvidenceForCheckpoints(
            client,
            input.tenantId,
            requiredCheckpointIds,
            asOfDate,
          );
        this.throwPolicyEvidenceRequired(
          policyCoverageReason({
            requiredControls: requiredControlIds.length,
            coveredControls: coveredControlsAfter.coveredCount,
            requiredCheckpoints: requiredCheckpointIds.length,
            coveredCheckpoints: coveredCheckpointsAfter.coveredCount,
          }),
        );
      }
    }

    const controlIncomplete =
      coveredControls.coveredCount < requiredControlIds.length;
    const checkpointIncomplete =
      coveredCheckpoints.coveredCount < requiredCheckpointIds.length;

    if (controlIncomplete || checkpointIncomplete) {
      this.throwPolicyEvidenceRequired(
        policyCoverageReason({
          requiredControls: requiredControlIds.length,
          coveredControls: coveredControls.coveredCount,
          requiredCheckpoints: requiredCheckpointIds.length,
          coveredCheckpoints: coveredCheckpoints.coveredCount,
        }),
      );
    }

    return {
      satisfied: true,
      requiredControlCount: requiredControlIds.length,
      requiredCheckpointCount: requiredCheckpointIds.length,
      coveredControlCount: coveredControls.coveredCount,
      coveredCheckpointCount: coveredCheckpoints.coveredCount,
    };
  }

  private requireClient(
    tx?: Prisma.TransactionClient,
  ): DbClient {
    const client = tx ?? this.db;
    if (!client) {
      throw new AppError(
        500,
        "EVIDENCE_GATE_MISCONFIGURED",
        "Evidence gate is not configured with a database client",
      );
    }
    return client;
  }

  private throwCoverageIncomplete(reason: EvidenceGateFailureReason): never {
    throw new AppError(
      409,
      "EVIDENCE_REQUIRED",
      "This Checkpoint review requires qualifying approved Evidence",
      { reason },
    );
  }

  private throwPolicyEvidenceRequired(reason: PolicyEvidenceGateReason): never {
    const message =
      reason === "EVIDENCE_GATE_NOT_CONFIGURED"
        ? "This Policy Version requires Evidence configuration before approval"
        : "This Policy Version approval requires qualifying approved Evidence coverage";
    throw new AppError(409, "EVIDENCE_REQUIRED", message, { reason });
  }

  private throwKpiEvidenceRequired(reason: KpiEvidenceGateReason): never {
    const message =
      reason === "EVIDENCE_KPI_LINK_REQUIRED"
        ? "This KPI actual requires at least one active Evidence link before approval"
        : "This KPI actual approval requires qualifying approved Evidence coverage";
    throw new AppError(409, "EVIDENCE_REQUIRED", message, { reason });
  }

  /**
   * Lock active exact-version mappings, mapped Controls, and in-scope Checkpoints.
   * Returns independent required Control and Checkpoint ID lists.
   */
  async resolveAndLockPolicyTargets(
    client: DbClient,
    tenantId: string,
    policyVersionId: string,
  ): Promise<{
    requiredControlIds: string[];
    requiredCheckpointIds: string[];
  }> {
    // 1) Active mappings for exact Policy Version
    const mappings = await client.$queryRaw<
      Array<{ id: string; control_id: string }>
    >`
      SELECT cpv.id, cpv.control_id
      FROM control_policy_versions AS cpv
      WHERE cpv.tenant_id = ${tenantId}::uuid
        AND cpv.policy_version_id = ${policyVersionId}::uuid
        AND cpv.is_active = true
      ORDER BY cpv.id ASC
      FOR SHARE OF cpv
    `;

    if (mappings.length === 0) {
      return { requiredControlIds: [], requiredCheckpointIds: [] };
    }

    const mappedControlIds = [
      ...new Set(mappings.map((m) => m.control_id)),
    ].sort();

    // 2) Non-ARCHIVED Controls among mappings
    const controls = await client.$queryRaw<
      Array<{ id: string; requires_evidence: boolean }>
    >`
      SELECT c.id, c.requires_evidence
      FROM controls AS c
      WHERE c.tenant_id = ${tenantId}::uuid
        AND c.id IN (${uuidInList(mappedControlIds)})
        AND c.lifecycle_status <> 'ARCHIVED'
      ORDER BY c.id ASC
      FOR SHARE OF c
    `;

    const eligibleControlIds = controls.map((c) => c.id);
    const requiredControlIds = controls
      .filter((c) => c.requires_evidence)
      .map((c) => c.id)
      .sort();

    if (eligibleControlIds.length === 0) {
      return { requiredControlIds: [], requiredCheckpointIds: [] };
    }

    // 3) ACTIVE Checkpoints under eligible mapped Controls
    const checkpoints = await client.$queryRaw<
      Array<{ id: string; evidence_required: boolean }>
    >`
      SELECT ch.id, ch.evidence_required
      FROM checkpoints AS ch
      WHERE ch.tenant_id = ${tenantId}::uuid
        AND ch.control_id IN (${uuidInList(eligibleControlIds)})
        AND ch.lifecycle_status = 'ACTIVE'
      ORDER BY ch.id ASC
      FOR SHARE OF ch
    `;

    const requiredCheckpointIds = checkpoints
      .filter((ch) => ch.evidence_required)
      .map((ch) => ch.id)
      .sort();

    return { requiredControlIds, requiredCheckpointIds };
  }

  /**
   * Select one deterministic qualifying Evidence per required Control.
   * Does not FOR SHARE here when empty; caller locks the union of Evidence IDs.
   */
  async lockQualifyingEvidenceForControls(
    client: DbClient,
    tenantId: string,
    controlIds: string[],
    asOfDate: UtcDateString,
  ): Promise<{ coveredCount: number; evidenceIds: string[] }> {
    if (controlIds.length === 0) {
      return { coveredCount: 0, evidenceIds: [] };
    }

    const rows = await client.$queryRaw<
      Array<{ control_id: string; evidence_id: string }>
    >`
      SELECT DISTINCT ON (l.control_id)
        l.control_id,
        e.id AS evidence_id
      FROM evidence AS e
      INNER JOIN evidence_control_links AS l
        ON l.tenant_id = e.tenant_id
       AND l.evidence_id = e.id
      WHERE e.tenant_id = ${tenantId}::uuid
        AND l.control_id IN (${uuidInList(controlIds)})
        AND l.is_active = true
        AND e.lifecycle_status = 'APPROVED'
        AND e.storage_key IS NOT NULL
        AND length(e.storage_key) > 0
        AND e.content_sha256 IS NOT NULL
        AND length(e.content_sha256) > 0
        AND e.byte_size IS NOT NULL
        AND e.byte_size > 0
        AND (e.issue_date IS NULL OR e.issue_date <= ${asOfDate}::date)
        AND (e.expires_at IS NULL OR e.expires_at >= ${asOfDate}::date)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence AS successor
          WHERE successor.tenant_id = e.tenant_id
            AND successor.supersedes_evidence_id = e.id
            AND successor.lifecycle_status IN ('APPROVED', 'ARCHIVED')
        )
      ORDER BY l.control_id ASC, e.id ASC
    `;

    return {
      coveredCount: rows.length,
      evidenceIds: rows.map((r) => r.evidence_id),
    };
  }

  async lockQualifyingEvidenceForCheckpoints(
    client: DbClient,
    tenantId: string,
    checkpointIds: string[],
    asOfDate: UtcDateString,
  ): Promise<{ coveredCount: number; evidenceIds: string[] }> {
    if (checkpointIds.length === 0) {
      return { coveredCount: 0, evidenceIds: [] };
    }

    const rows = await client.$queryRaw<
      Array<{ checkpoint_id: string; evidence_id: string }>
    >`
      SELECT DISTINCT ON (l.checkpoint_id)
        l.checkpoint_id,
        e.id AS evidence_id
      FROM evidence AS e
      INNER JOIN evidence_checkpoint_links AS l
        ON l.tenant_id = e.tenant_id
       AND l.evidence_id = e.id
      WHERE e.tenant_id = ${tenantId}::uuid
        AND l.checkpoint_id IN (${uuidInList(checkpointIds)})
        AND l.is_active = true
        AND e.lifecycle_status = 'APPROVED'
        AND e.storage_key IS NOT NULL
        AND length(e.storage_key) > 0
        AND e.content_sha256 IS NOT NULL
        AND length(e.content_sha256) > 0
        AND e.byte_size IS NOT NULL
        AND e.byte_size > 0
        AND (e.issue_date IS NULL OR e.issue_date <= ${asOfDate}::date)
        AND (e.expires_at IS NULL OR e.expires_at >= ${asOfDate}::date)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence AS successor
          WHERE successor.tenant_id = e.tenant_id
            AND successor.supersedes_evidence_id = e.id
            AND successor.lifecycle_status IN ('APPROVED', 'ARCHIVED')
        )
      ORDER BY l.checkpoint_id ASC, e.id ASC
    `;

    return {
      coveredCount: rows.length,
      evidenceIds: rows.map((r) => r.evidence_id),
    };
  }

  /**
   * Acquire FOR SHARE on selected Evidence rows in deterministic ID order.
   * Re-checks APPROVED so archive between select and lock cannot race open.
   */
  private async lockEvidenceRowsById(
    client: DbClient,
    tenantId: string,
    evidenceIds: string[],
  ): Promise<string[]> {
    if (evidenceIds.length === 0) return [];
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM evidence AS e
      WHERE e.tenant_id = ${tenantId}::uuid
        AND e.id IN (${uuidInList(evidenceIds)})
        AND e.lifecycle_status = 'APPROVED'
      ORDER BY e.id ASC
      FOR SHARE OF e
    `;
    return rows.map((r) => r.id);
  }

  /**
   * Select and row-lock one Evidence row that satisfies Checkpoint gate rules.
   */
  async lockOneQualifyingCheckpointEvidence(
    client: DbClient,
    tenantId: string,
    checkpointId: string,
    asOfDate: UtcDateString,
  ): Promise<string | null> {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM evidence AS e
      INNER JOIN evidence_checkpoint_links AS l
        ON l.tenant_id = e.tenant_id
       AND l.evidence_id = e.id
      WHERE e.tenant_id = ${tenantId}::uuid
        AND l.checkpoint_id = ${checkpointId}::uuid
        AND l.is_active = true
        AND e.lifecycle_status = 'APPROVED'
        AND e.storage_key IS NOT NULL
        AND length(e.storage_key) > 0
        AND e.content_sha256 IS NOT NULL
        AND length(e.content_sha256) > 0
        AND e.byte_size IS NOT NULL
        AND e.byte_size > 0
        AND (e.issue_date IS NULL OR e.issue_date <= ${asOfDate}::date)
        AND (e.expires_at IS NULL OR e.expires_at >= ${asOfDate}::date)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence AS successor
          WHERE successor.tenant_id = e.tenant_id
            AND successor.supersedes_evidence_id = e.id
            AND successor.lifecycle_status IN ('APPROVED', 'ARCHIVED')
        )
      ORDER BY e.id ASC
      LIMIT 1
      FOR SHARE OF e
    `;
    return rows[0]?.id ?? null;
  }

  /**
   * Select and row-lock one Evidence row that satisfies KPI Actual gate rules.
   */
  async lockOneQualifyingKpiActualEvidence(
    client: DbClient,
    tenantId: string,
    kpiActualId: string,
    asOfDate: UtcDateString,
  ): Promise<string | null> {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM evidence AS e
      INNER JOIN evidence_kpi_actual_links AS l
        ON l.tenant_id = e.tenant_id
       AND l.evidence_id = e.id
      WHERE e.tenant_id = ${tenantId}::uuid
        AND l.kpi_actual_id = ${kpiActualId}::uuid
        AND l.is_active = true
        AND e.lifecycle_status = 'APPROVED'
        AND e.storage_key IS NOT NULL
        AND length(e.storage_key) > 0
        AND e.content_sha256 IS NOT NULL
        AND length(e.content_sha256) > 0
        AND e.byte_size IS NOT NULL
        AND e.byte_size > 0
        AND (e.issue_date IS NULL OR e.issue_date <= ${asOfDate}::date)
        AND (e.expires_at IS NULL OR e.expires_at >= ${asOfDate}::date)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence AS successor
          WHERE successor.tenant_id = e.tenant_id
            AND successor.supersedes_evidence_id = e.id
            AND successor.lifecycle_status IN ('APPROVED', 'ARCHIVED')
        )
      ORDER BY e.id ASC
      LIMIT 1
      FOR SHARE OF e
    `;
    return rows[0]?.id ?? null;
  }
}
