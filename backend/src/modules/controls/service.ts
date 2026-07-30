import type {
  ControlImplementationStatus,
  GovernanceRecordStatus,
} from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { GovernanceRuleError } from "../governance/domain-error.js";
import {
  assertControlArchiveAllowed,
  assertControlImplementation,
  assertGovernanceLifecycleTransition,
  assertSameStateLifecycleForbidden,
  assertUniqueActiveControlPolicyMappings,
  assertUniqueMappingIds,
  mappingIdSetsEqual,
  safeControlAuditMetadata,
} from "./domain.js";
import type {
  AuditContext,
  ControlCounts,
  ControlRecord,
  ControlRepository,
} from "./repository.js";
import type {
  ControlAuditListQuery,
  ControlListQuery,
  CreateControlBody,
  ReplaceControlFrameworkRulesBody,
  ReplaceControlFrameworksBody,
  ReplaceControlPolicyVersionsBody,
  UpdateControlBody,
} from "./validators.js";

const dateOnly = (value: Date | null | undefined) =>
  value == null ? null : value.toISOString().slice(0, 10);

const inputDate = (value: string | null | undefined) =>
  value == null ? null : new Date(`${value}T00:00:00.000Z`);

const personDto = (
  person: { id: string; code: string; fullName: string } | null | undefined,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const departmentDto = (
  department:
    | { id: string; code: string; name: string }
    | null
    | undefined,
) =>
  department
    ? {
        id: department.id,
        code: department.code,
        name: department.name,
      }
    : null;

const mapGovernanceError = (error: unknown): never => {
  if (error instanceof GovernanceRuleError) {
    if (error.code === "CONTROL_ACTIVE_CHECKPOINTS_EXIST") {
      throw new AppError(
        409,
        "CONTROL_HAS_ACTIVE_CHECKPOINTS",
        "Control cannot be archived while active Checkpoints exist",
      );
    }
    if (
      error.code === "CONTROL_INVALID_STATE" ||
      error.code === "GOVERNANCE_ARCHIVE_TERMINAL"
    ) {
      throw new AppError(409, "CONTROL_INVALID_STATE", error.message);
    }
    if (
      error.code === "CONTROL_MAPPING_DUPLICATE" ||
      error.code === "CONTROL_POLICY_ACTIVE_MAPPING_DUPLICATE"
    ) {
      throw new AppError(400, "CONTROL_MAPPING_INVALID", error.message);
    }
    if (error.code === "CONTROL_IMPLEMENTATION_NOTES_REQUIRED") {
      throw new AppError(400, "VALIDATION_ERROR", error.message);
    }
    throw new AppError(400, error.code, error.message);
  }
  throw error;
};

const relatedInvalid = (message: string) =>
  new AppError(400, "RELATED_RECORD_INVALID", message);

const mappingInvalid = (message: string) =>
  new AppError(400, "CONTROL_MAPPING_INVALID", message);

const controlNotFound = () =>
  new AppError(404, "CONTROL_NOT_FOUND", "Control not found");

const controlArchived = () =>
  new AppError(
    409,
    "CONTROL_INVALID_STATE",
    "Control is archived and cannot be modified",
  );

const invalidState = (message: string) =>
  new AppError(409, "CONTROL_INVALID_STATE", message);

const assertReviewDatePair = (
  lastReviewDate: Date | null,
  nextReviewDate: Date | null,
) => {
  if (
    lastReviewDate &&
    nextReviewDate &&
    dateOnly(nextReviewDate)! <= dateOnly(lastReviewDate)!
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "nextReviewDate must be later than lastReviewDate",
    );
  }
};

const countsDto = (counts: ControlCounts) => ({
  activePolicyVersionMappingCount: counts.activePolicyVersionMappingCount,
  activeFrameworkMappingCount: counts.activeFrameworkMappingCount,
  activeFrameworkRuleMappingCount: counts.activeFrameworkRuleMappingCount,
  activeCheckpointCount: counts.activeCheckpointCount,
  inactiveCheckpointCount: counts.inactiveCheckpointCount,
  archivedCheckpointCount: counts.archivedCheckpointCount,
});

export const controlDetailDto = (
  control: ControlRecord,
  counts: ControlCounts,
) => ({
  id: control.id,
  code: control.code,
  title: control.title,
  description: control.description,
  objective: control.objective,
  owner: personDto(control.owner),
  department: departmentDto(control.department),
  implementationStatus: control.implementationStatus,
  implementationNotes: control.implementationNotes,
  controlType: control.controlType,
  frequency: control.frequency,
  verificationMethod: control.verificationMethod,
  requiresEvidence: control.requiresEvidence,
  lifecycleStatus: control.lifecycleStatus,
  lastReviewDate: dateOnly(control.lastReviewDate),
  nextReviewDate: dateOnly(control.nextReviewDate),
  ...countsDto(counts),
  archivedAt: control.archivedAt,
  createdAt: control.createdAt,
  updatedAt: control.updatedAt,
});

export const controlListDto = (
  control: ControlRecord,
  counts: ControlCounts,
) => ({
  id: control.id,
  code: control.code,
  title: control.title,
  owner: personDto(control.owner),
  department: departmentDto(control.department),
  implementationStatus: control.implementationStatus,
  controlType: control.controlType,
  frequency: control.frequency,
  requiresEvidence: control.requiresEvidence,
  lifecycleStatus: control.lifecycleStatus,
  lastReviewDate: dateOnly(control.lastReviewDate),
  nextReviewDate: dateOnly(control.nextReviewDate),
  activePolicyVersionMappingCount: counts.activePolicyVersionMappingCount,
  activeFrameworkMappingCount: counts.activeFrameworkMappingCount,
  activeFrameworkRuleMappingCount: counts.activeFrameworkRuleMappingCount,
  activeCheckpointCount: counts.activeCheckpointCount,
  archivedAt: control.archivedAt,
  createdAt: control.createdAt,
  updatedAt: control.updatedAt,
});

const uniqueIds = (ids: readonly string[]) => [...new Set(ids)];

export class ControlService {
  constructor(private readonly repository: ControlRepository) {}

  private async assertActiveMember(tenantId: string, userId: string | null) {
    if (!userId) return;
    const member = await this.repository.findTenantUser(tenantId, userId);
    if (!member) {
      throw relatedInvalid("Related user is not an active Company member");
    }
  }

  private async assertDepartment(
    tenantId: string,
    departmentId: string | null,
  ) {
    if (!departmentId) return;
    const department = await this.repository.findDepartment(
      tenantId,
      departmentId,
    );
    if (!department) {
      throw relatedInvalid("Department was not found for this Company");
    }
  }

  private async assertFrameworks(frameworkIds: string[]) {
    const unique = uniqueIds(frameworkIds);
    if (unique.length === 0) return unique;
    const found = await this.repository.findActiveFrameworks(unique);
    if (found.length !== unique.length) {
      throw relatedInvalid("One or more Frameworks are invalid or inactive");
    }
    return unique;
  }

  private async resolveApprovedPolicyVersions(
    tenantId: string,
    policyVersionIds: string[],
  ) {
    const unique = uniqueIds(policyVersionIds);
    if (unique.length === 0) return [] as Array<{
      policyId: string;
      policyVersionId: string;
    }>;
    try {
      assertUniqueMappingIds(unique, "policyVersionIds");
    } catch (error) {
      mapGovernanceError(error);
    }
    const found = await this.repository.findPolicyVersionsByIds(
      tenantId,
      unique,
    );
    if (found.length !== unique.length) {
      throw relatedInvalid(
        "One or more Policy Versions were not found for this Company",
      );
    }
    const byPolicy = new Map<string, string>();
    for (const version of found) {
      if (version.status !== "APPROVED") {
        throw mappingInvalid(
          "Only APPROVED Policy Versions may be actively mapped",
        );
      }
      if (byPolicy.has(version.policyId)) {
        throw mappingInvalid(
          "A Control request cannot map two Versions of the same Policy",
        );
      }
      byPolicy.set(version.policyId, version.id);
    }
    try {
      assertUniqueActiveControlPolicyMappings(
        found.map((version) => ({
          controlId: "pending",
          policyId: version.policyId,
          isActive: true,
        })),
      );
    } catch (error) {
      mapGovernanceError(error);
    }
    return found.map((version) => ({
      policyId: version.policyId,
      policyVersionId: version.id,
    }));
  }

  private async resolveFrameworkRules(
    frameworkRuleIds: string[],
    activeFrameworkIds: ReadonlySet<string>,
  ) {
    const unique = uniqueIds(frameworkRuleIds);
    if (unique.length === 0) {
      return [] as Array<{ frameworkId: string; frameworkRuleId: string }>;
    }
    try {
      assertUniqueMappingIds(unique, "frameworkRuleIds");
    } catch (error) {
      mapGovernanceError(error);
    }
    const found = await this.repository.findActiveFrameworkRules(unique);
    if (found.length !== unique.length) {
      throw relatedInvalid(
        "One or more Framework Rules are invalid or inactive",
      );
    }
    for (const rule of found) {
      if (!activeFrameworkIds.has(rule.frameworkId)) {
        throw mappingInvalid(
          "Framework Rule requires an active Control Framework mapping",
        );
      }
    }
    return found.map((rule) => ({
      frameworkId: rule.frameworkId,
      frameworkRuleId: rule.id,
    }));
  }

  private requireControl(control: ControlRecord | null) {
    if (!control) throw controlNotFound();
    return control;
  }

  private async loadWithCounts(tenantId: string, controlId: string) {
    const control = this.requireControl(
      await this.repository.findControl(tenantId, controlId),
    );
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return { control, counts: counts.get(controlId)! };
  }

  async list(tenantId: string, query: ControlListQuery) {
    const result = await this.repository.listControls(tenantId, query);
    return {
      data: result.items.map((item) =>
        controlListDto(item, result.counts.get(item.id)!),
      ),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, controlId: string) {
    const { control, counts } = await this.loadWithCounts(tenantId, controlId);
    return controlDetailDto(control, counts);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateControlBody,
    context: AuditContext,
  ) {
    try {
      assertControlImplementation(
        body.implementationStatus,
        body.implementationNotes,
      );
    } catch (error) {
      mapGovernanceError(error);
    }
    await this.assertActiveMember(tenantId, body.ownerId ?? null);
    await this.assertDepartment(tenantId, body.departmentId ?? null);

    const policyVersions = await this.resolveApprovedPolicyVersions(
      tenantId,
      body.policyVersionIds ?? [],
    );
    const frameworkIds = await this.assertFrameworks(body.frameworkIds ?? []);
    const frameworkRules = await this.resolveFrameworkRules(
      body.frameworkRuleIds ?? [],
      new Set(frameworkIds),
    );

    const lastReviewDate = inputDate(body.lastReviewDate);
    const nextReviewDate = inputDate(body.nextReviewDate);
    assertReviewDatePair(lastReviewDate, nextReviewDate);

    const mappingAudits = [
      ...(policyVersions.length > 0
        ? [
            {
              mappingType: "POLICY_VERSION" as const,
              addedIds: policyVersions.map((m) => m.policyVersionId),
              activeCount: policyVersions.length,
            },
          ]
        : []),
      ...(frameworkIds.length > 0
        ? [
            {
              mappingType: "FRAMEWORK" as const,
              addedIds: frameworkIds,
              activeCount: frameworkIds.length,
            },
          ]
        : []),
      ...(frameworkRules.length > 0
        ? [
            {
              mappingType: "FRAMEWORK_RULE" as const,
              addedIds: frameworkRules.map((m) => m.frameworkRuleId),
              activeCount: frameworkRules.length,
            },
          ]
        : []),
    ];

    const created = await this.repository.createControlWithMappings({
      tenantId,
      actorUserId,
      title: body.title,
      description: body.description ?? null,
      objective: body.objective,
      ownerId: body.ownerId ?? null,
      departmentId: body.departmentId ?? null,
      implementationStatus: body.implementationStatus,
      implementationNotes: body.implementationNotes ?? null,
      controlType: body.controlType,
      frequency: body.frequency,
      verificationMethod: body.verificationMethod,
      requiresEvidence: body.requiresEvidence ?? false,
      lastReviewDate,
      nextReviewDate,
      policyVersions,
      frameworkIds,
      frameworkRules,
      context,
      mappingAudits,
    });
    if (!created) throw controlNotFound();
    const counts = await this.repository.getControlCounts(tenantId, [
      created.id,
    ]);
    return controlDetailDto(created, counts.get(created.id)!);
  }

  async update(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    body: UpdateControlBody,
    context: AuditContext,
  ) {
    const existing = this.requireControl(
      await this.repository.findControl(tenantId, controlId),
    );
    if (existing.lifecycleStatus === "ARCHIVED") throw controlArchived();

    if (body.ownerId !== undefined) {
      await this.assertActiveMember(tenantId, body.ownerId);
    }
    if (body.departmentId !== undefined) {
      await this.assertDepartment(tenantId, body.departmentId);
    }

    const nextImplementationStatus =
      body.implementationStatus ?? existing.implementationStatus;
    const nextNotes =
      body.implementationNotes !== undefined
        ? body.implementationNotes
        : existing.implementationNotes;
    try {
      assertControlImplementation(nextImplementationStatus, nextNotes);
    } catch (error) {
      mapGovernanceError(error);
    }

    const nextLast =
      body.lastReviewDate !== undefined
        ? inputDate(body.lastReviewDate)
        : existing.lastReviewDate;
    const nextNext =
      body.nextReviewDate !== undefined
        ? inputDate(body.nextReviewDate)
        : existing.nextReviewDate;
    assertReviewDatePair(nextLast, nextNext);

    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockControl(tx, tenantId, controlId);
      if (!locked[0]) throw controlNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw controlArchived();

      const current = locked[0];
      const changedFields: string[] = [];
      const data: Record<string, unknown> = { updatedById: actorUserId };

      const assignIfChanged = <T>(
        field: string,
        incoming: T | undefined,
        currentValue: T,
        write: (value: T) => void,
      ) => {
        if (incoming === undefined) return;
        if (incoming === currentValue) return;
        changedFields.push(field);
        write(incoming);
      };

      assignIfChanged("title", body.title, current.title, (v) => {
        data.title = v;
      });
      if (body.description !== undefined) {
        const next = body.description;
        if (next !== current.description) {
          changedFields.push("description");
          data.description = next;
        }
      }
      assignIfChanged("objective", body.objective, current.objective, (v) => {
        data.objective = v;
      });
      if (body.ownerId !== undefined && body.ownerId !== current.owner_id) {
        changedFields.push("ownerId");
        data.ownerId = body.ownerId;
      }
      if (
        body.departmentId !== undefined &&
        body.departmentId !== current.department_id
      ) {
        changedFields.push("departmentId");
        data.departmentId = body.departmentId;
      }
      if (
        body.implementationStatus !== undefined &&
        body.implementationStatus !== current.implementation_status
      ) {
        changedFields.push("implementationStatus");
        data.implementationStatus = body.implementationStatus;
      }
      if (
        body.implementationNotes !== undefined &&
        body.implementationNotes !== current.implementation_notes
      ) {
        changedFields.push("implementationNotes");
        data.implementationNotes = body.implementationNotes;
      }
      assignIfChanged(
        "controlType",
        body.controlType,
        current.control_type,
        (v) => {
          data.controlType = v;
        },
      );
      assignIfChanged("frequency", body.frequency, current.frequency, (v) => {
        data.frequency = v;
      });
      assignIfChanged(
        "verificationMethod",
        body.verificationMethod,
        current.verification_method,
        (v) => {
          data.verificationMethod = v;
        },
      );
      if (
        body.requiresEvidence !== undefined &&
        body.requiresEvidence !== current.requires_evidence
      ) {
        changedFields.push("requiresEvidence");
        data.requiresEvidence = body.requiresEvidence;
      }
      if (body.lastReviewDate !== undefined) {
        const next = inputDate(body.lastReviewDate);
        if (dateOnly(next) !== dateOnly(current.last_review_date)) {
          changedFields.push("lastReviewDate");
          data.lastReviewDate = next;
        }
      }
      if (body.nextReviewDate !== undefined) {
        const next = inputDate(body.nextReviewDate);
        if (dateOnly(next) !== dateOnly(current.next_review_date)) {
          changedFields.push("nextReviewDate");
          data.nextReviewDate = next;
        }
      }

      if (changedFields.length === 0) {
        return this.repository.findControl(tenantId, controlId, tx);
      }

      await tx.control.update({
        where: { id: controlId },
        data,
      });

      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CONTROL_UPDATED",
        entityType: "CONTROL",
        entityId: controlId,
        metadata: safeControlAuditMetadata({
          code: current.code,
          changedFields,
        }),
        context,
      });
      if (changedFields.includes("ownerId")) {
        await this.repository.writeAudit(tx, {
          tenantId,
          actorUserId,
          action: "CONTROL_OWNER_CHANGED",
          entityType: "CONTROL",
          entityId: controlId,
          metadata: safeControlAuditMetadata({
            code: current.code,
            changedFields: ["ownerId"],
          }),
          context,
        });
      }
      if (changedFields.includes("implementationStatus")) {
        await this.repository.writeAudit(tx, {
          tenantId,
          actorUserId,
          action: "CONTROL_IMPLEMENTATION_STATUS_CHANGED",
          entityType: "CONTROL",
          entityId: controlId,
          metadata: safeControlAuditMetadata({
            code: current.code,
            changedFields: ["implementationStatus"],
          }),
          context,
        });
      }
      return this.repository.findControl(tenantId, controlId, tx);
    });

    const control = this.requireControl(updated);
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return controlDetailDto(control, counts.get(controlId)!);
  }

  private async transitionLifecycle(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    target: GovernanceRecordStatus,
    action: "CONTROL_ACTIVATED" | "CONTROL_DEACTIVATED" | "CONTROL_ARCHIVED",
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockControl(tx, tenantId, controlId);
      if (!locked[0]) throw controlNotFound();
      const current = locked[0].lifecycle_status;
      try {
        assertSameStateLifecycleForbidden(current, target);
        assertGovernanceLifecycleTransition(current, target);
      } catch (error) {
        mapGovernanceError(error);
      }

      if (target === "ARCHIVED") {
        const activeCheckpointCount = await tx.checkpoint.count({
          where: {
            tenantId,
            controlId,
            lifecycleStatus: "ACTIVE",
          },
        });
        try {
          assertControlArchiveAllowed(target, activeCheckpointCount);
        } catch (error) {
          mapGovernanceError(error);
        }
      }

      await tx.control.update({
        where: { id: controlId },
        data: {
          lifecycleStatus: target,
          archivedAt: target === "ARCHIVED" ? new Date() : null,
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action,
        entityType: "CONTROL",
        entityId: controlId,
        metadata: safeControlAuditMetadata({
          code: locked[0].code,
          fromStatus: current,
          toStatus: target,
          changedFields: ["lifecycleStatus"],
        }),
        context,
      });
      return this.repository.findControl(tenantId, controlId, tx);
    });
    const control = this.requireControl(updated);
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return controlDetailDto(control, counts.get(controlId)!);
  }

  activate(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      controlId,
      actorUserId,
      "ACTIVE",
      "CONTROL_ACTIVATED",
      context,
    );
  }

  deactivate(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      controlId,
      actorUserId,
      "INACTIVE",
      "CONTROL_DEACTIVATED",
      context,
    );
  }

  archive(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      controlId,
      actorUserId,
      "ARCHIVED",
      "CONTROL_ARCHIVED",
      context,
    );
  }

  async replacePolicyVersions(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    body: ReplaceControlPolicyVersionsBody,
    context: AuditContext,
  ) {
    const desired = await this.resolveApprovedPolicyVersions(
      tenantId,
      body.policyVersionIds,
    );
    const desiredByPolicy = new Map(
      desired.map((item) => [item.policyId, item.policyVersionId]),
    );
    const desiredVersionIds = desired.map((item) => item.policyVersionId);

    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockControl(tx, tenantId, controlId);
      if (!locked[0]) throw controlNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw controlArchived();

      const existing = await tx.controlPolicyVersion.findMany({
        where: { tenantId, controlId },
      });
      const currentActive = existing
        .filter((row) => row.isActive)
        .map((row) => row.policyVersionId);
      if (mappingIdSetsEqual(currentActive, desiredVersionIds)) {
        return this.repository.findControl(tenantId, controlId, tx);
      }

      const addedIds: string[] = [];
      const removedIds: string[] = [];

      // Phase 1: deactivate every active row that is not the desired Version
      // for its Policy (satisfies control_policy_versions_one_active_mapping).
      for (const mapping of existing) {
        const desiredVersionId = desiredByPolicy.get(mapping.policyId);
        const shouldStayActive =
          desiredVersionId !== undefined &&
          mapping.policyVersionId === desiredVersionId;
        if (mapping.isActive && !shouldStayActive) {
          await tx.controlPolicyVersion.update({
            where: { id: mapping.id },
            data: { isActive: false, updatedById: actorUserId },
          });
          removedIds.push(mapping.policyVersionId);
        }
      }

      // Phase 2: reactivate historical rows or create missing desired rows.
      for (const [policyId, policyVersionId] of desiredByPolicy) {
        const historical = existing.find(
          (row) =>
            row.policyId === policyId &&
            row.policyVersionId === policyVersionId,
        );
        if (historical) {
          // Desired rows that were already active were left alone in phase 1.
          if (historical.isActive) continue;
          await tx.controlPolicyVersion.update({
            where: { id: historical.id },
            data: { isActive: true, updatedById: actorUserId },
          });
          addedIds.push(policyVersionId);
        } else {
          await tx.controlPolicyVersion.create({
            data: {
              tenantId,
              controlId,
              policyId,
              policyVersionId,
              isActive: true,
              createdById: actorUserId,
              updatedById: actorUserId,
            },
          });
          addedIds.push(policyVersionId);
        }
      }

      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CONTROL_MAPPINGS_CHANGED",
        entityType: "CONTROL",
        entityId: controlId,
        metadata: safeControlAuditMetadata({
          code: locked[0].code,
          mappingType: "POLICY_VERSION",
          addedIds,
          removedIds,
          activeCount: desiredVersionIds.length,
        }),
        context,
      });
      return this.repository.findControl(tenantId, controlId, tx);
    });

    const control = this.requireControl(updated);
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return controlDetailDto(control, counts.get(controlId)!);
  }

  async replaceFrameworks(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    body: ReplaceControlFrameworksBody,
    context: AuditContext,
  ) {
    const desiredIds = await this.assertFrameworks(body.frameworkIds);

    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockControl(tx, tenantId, controlId);
      if (!locked[0]) throw controlNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw controlArchived();

      const existing = await tx.controlFramework.findMany({
        where: { tenantId, controlId },
      });
      const currentActive = existing
        .filter((row) => row.isActive)
        .map((row) => row.frameworkId);
      if (mappingIdSetsEqual(currentActive, desiredIds)) {
        return this.repository.findControl(tenantId, controlId, tx);
      }

      const desired = new Set(desiredIds);
      const toDeactivate = existing.filter(
        (row) => row.isActive && !desired.has(row.frameworkId),
      );
      if (toDeactivate.length > 0) {
        const dependent = await tx.ruleControl.count({
          where: {
            tenantId,
            controlId,
            isActive: true,
            frameworkId: { in: toDeactivate.map((row) => row.frameworkId) },
          },
        });
        if (dependent > 0) {
          throw invalidState(
            "Framework mapping cannot be removed while active Framework Rule mappings depend on it",
          );
        }
      }

      const remaining = new Set(desiredIds);
      const addedIds: string[] = [];
      const removedIds: string[] = [];

      for (const mapping of existing) {
        const shouldBeActive = remaining.has(mapping.frameworkId);
        if (mapping.isActive !== shouldBeActive) {
          await tx.controlFramework.update({
            where: { id: mapping.id },
            data: { isActive: shouldBeActive, updatedById: actorUserId },
          });
          if (shouldBeActive) addedIds.push(mapping.frameworkId);
          else removedIds.push(mapping.frameworkId);
        }
        remaining.delete(mapping.frameworkId);
      }
      for (const frameworkId of remaining) {
        await tx.controlFramework.create({
          data: {
            tenantId,
            controlId,
            frameworkId,
            isActive: true,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });
        addedIds.push(frameworkId);
      }

      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CONTROL_MAPPINGS_CHANGED",
        entityType: "CONTROL",
        entityId: controlId,
        metadata: safeControlAuditMetadata({
          code: locked[0].code,
          mappingType: "FRAMEWORK",
          addedIds,
          removedIds,
          activeCount: desiredIds.length,
        }),
        context,
      });
      return this.repository.findControl(tenantId, controlId, tx);
    });

    const control = this.requireControl(updated);
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return controlDetailDto(control, counts.get(controlId)!);
  }

  async replaceFrameworkRules(
    tenantId: string,
    controlId: string,
    actorUserId: string,
    body: ReplaceControlFrameworkRulesBody,
    context: AuditContext,
  ) {
    const uniqueRuleIds = uniqueIds(body.frameworkRuleIds);

    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockControl(tx, tenantId, controlId);
      if (!locked[0]) throw controlNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw controlArchived();

      const activeFrameworks = await tx.controlFramework.findMany({
        where: { tenantId, controlId, isActive: true },
        select: { frameworkId: true },
      });
      const activeFrameworkIds = new Set(
        activeFrameworks.map((row) => row.frameworkId),
      );

      // Validate rules inside the transaction against locked Control state.
      let desiredRules: Array<{
        frameworkId: string;
        frameworkRuleId: string;
      }> = [];
      if (uniqueRuleIds.length > 0) {
        try {
          assertUniqueMappingIds(uniqueRuleIds, "frameworkRuleIds");
        } catch (error) {
          mapGovernanceError(error);
        }
        const found = await tx.frameworkRule.findMany({
          where: { id: { in: uniqueRuleIds }, status: "ACTIVE" },
          select: { id: true, frameworkId: true },
        });
        if (found.length !== uniqueRuleIds.length) {
          throw relatedInvalid(
            "One or more Framework Rules are invalid or inactive",
          );
        }
        for (const rule of found) {
          if (!activeFrameworkIds.has(rule.frameworkId)) {
            throw mappingInvalid(
              "Framework Rule requires an active Control Framework mapping",
            );
          }
        }
        desiredRules = found.map((rule) => ({
          frameworkId: rule.frameworkId,
          frameworkRuleId: rule.id,
        }));
      }

      const desiredIds = desiredRules.map((rule) => rule.frameworkRuleId);
      const existing = await tx.ruleControl.findMany({
        where: { tenantId, controlId },
      });
      const currentActive = existing
        .filter((row) => row.isActive)
        .map((row) => row.frameworkRuleId);
      if (mappingIdSetsEqual(currentActive, desiredIds)) {
        return this.repository.findControl(tenantId, controlId, tx);
      }

      const remaining = new Map(
        desiredRules.map((rule) => [rule.frameworkRuleId, rule.frameworkId]),
      );
      const addedIds: string[] = [];
      const removedIds: string[] = [];

      for (const mapping of existing) {
        const shouldBeActive = remaining.has(mapping.frameworkRuleId);
        if (mapping.isActive !== shouldBeActive) {
          await tx.ruleControl.update({
            where: { id: mapping.id },
            data: { isActive: shouldBeActive, updatedById: actorUserId },
          });
          if (shouldBeActive) addedIds.push(mapping.frameworkRuleId);
          else removedIds.push(mapping.frameworkRuleId);
        }
        remaining.delete(mapping.frameworkRuleId);
      }
      for (const [frameworkRuleId, frameworkId] of remaining) {
        await tx.ruleControl.create({
          data: {
            tenantId,
            controlId,
            frameworkId,
            frameworkRuleId,
            isActive: true,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });
        addedIds.push(frameworkRuleId);
      }

      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CONTROL_MAPPINGS_CHANGED",
        entityType: "CONTROL",
        entityId: controlId,
        metadata: safeControlAuditMetadata({
          code: locked[0].code,
          mappingType: "FRAMEWORK_RULE",
          addedIds,
          removedIds,
          activeCount: desiredIds.length,
        }),
        context,
      });
      return this.repository.findControl(tenantId, controlId, tx);
    });

    const control = this.requireControl(updated);
    const counts = await this.repository.getControlCounts(tenantId, [
      controlId,
    ]);
    return controlDetailDto(control, counts.get(controlId)!);
  }

  async traceability(tenantId: string, controlId: string) {
    const result = await this.repository.getTraceability(tenantId, controlId);
    if (!result) throw controlNotFound();
    return {
      control: controlDetailDto(result.control, result.counts),
      policyVersionMappings: result.policyMappings.map((mapping) => ({
        id: mapping.id,
        isActive: mapping.isActive,
        policyId: mapping.policyId,
        policyVersionId: mapping.policyVersionId,
        policy: {
          id: mapping.policyVersion.policy.id,
          code: mapping.policyVersion.policy.code,
          title: mapping.policyVersion.policy.title,
        },
        policyVersion: {
          id: mapping.policyVersion.id,
          version: `${mapping.policyVersion.versionMajor}.${mapping.policyVersion.versionMinor}`,
          versionMajor: mapping.policyVersion.versionMajor,
          versionMinor: mapping.policyVersion.versionMinor,
          status: mapping.policyVersion.status,
        },
      })),
      frameworkMappings: result.frameworkMappings.map((mapping) => ({
        id: mapping.id,
        isActive: mapping.isActive,
        frameworkId: mapping.frameworkId,
        framework: mapping.framework
          ? {
              id: mapping.framework.id,
              code: mapping.framework.code,
              name: mapping.framework.name,
              version: mapping.framework.version,
            }
          : null,
      })),
      frameworkRuleMappings: result.ruleMappings.map((mapping) => ({
        id: mapping.id,
        isActive: mapping.isActive,
        frameworkId: mapping.frameworkId,
        frameworkRuleId: mapping.frameworkRuleId,
        frameworkRule: {
          id: mapping.frameworkRule.id,
          frameworkId: mapping.frameworkRule.frameworkId,
          code: mapping.frameworkRule.code,
          title: mapping.frameworkRule.title,
        },
      })),
      checkpointCounts: {
        active: result.counts.activeCheckpointCount,
        inactive: result.counts.inactiveCheckpointCount,
        archived: result.counts.archivedCheckpointCount,
      },
    };
  }

  async listAuditEvents(
    tenantId: string,
    controlId: string,
    query: ControlAuditListQuery,
  ) {
    this.requireControl(
      await this.repository.findControl(tenantId, controlId),
    );
    const result = await this.repository.listAuditEvents(
      tenantId,
      controlId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.items.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        metadata: item.metadata,
        createdAt: item.createdAt,
        userId: item.userId,
      })),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }
}

/** Exported for unit tests of AppError mapping helpers. */
export const mapControlGovernanceErrorForTest = (error: unknown) => {
  try {
    mapGovernanceError(error);
  } catch (mapped) {
    return mapped;
  }
  return null;
};

export type { ControlImplementationStatus };
