import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import {
  coverageIncompleteReason,
  type EvidenceGateFailureReason,
  utcDateString,
  type UtcDateString,
} from "./eligibility.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CheckpointGateResult = {
  satisfied: true;
  qualifyingCount: number;
};

/**
 * Central Evidence gate evaluation.
 *
 * Checkpoint: real coverage against active APPROVED Evidence links.
 * KPI/Policy: preserve fail-closed 501 until later slices define relationships.
 */
export class EvidenceGateService {
  constructor(private readonly db?: PrismaClient) {}

  /**
   * KPI compatibility: boolean-only stub.
   * false → pass; true → fail-closed 501 (relationship model deferred).
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
   * Checkpoint review gate. When evidenceRequired is false, passes immediately.
   * When true, requires ≥1 qualifying Evidence actively linked to the checkpoint.
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

    const client = input.tx ?? this.db;
    if (!client) {
      throw new AppError(
        500,
        "EVIDENCE_GATE_MISCONFIGURED",
        "Evidence gate is not configured with a database client",
      );
    }

    const asOfDate = input.asOfDate ?? utcDateString();
    const qualifyingCount = await this.countQualifyingCheckpointEvidence(
      client,
      input.tenantId,
      input.checkpointId,
      asOfDate,
    );

    if (qualifyingCount < 1) {
      this.throwCoverageIncomplete(coverageIncompleteReason());
    }

    return { satisfied: true, qualifyingCount };
  }

  private throwCoverageIncomplete(reason: EvidenceGateFailureReason): never {
    throw new AppError(
      409,
      "EVIDENCE_REQUIRED",
      "This Checkpoint review requires qualifying approved Evidence",
      { reason },
    );
  }

  /**
   * Set-based count of Evidence that satisfies Checkpoint gate rules.
   * See AD-017 / eligibility module for full rule list.
   */
  async countQualifyingCheckpointEvidence(
    client: DbClient,
    tenantId: string,
    checkpointId: string,
    asOfDate: UtcDateString,
  ): Promise<number> {
    const rows = await client.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
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
    `;
    return Number(rows[0]?.count ?? 0n);
  }
}
