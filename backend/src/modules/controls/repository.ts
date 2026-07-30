import {
  Prisma,
  type ControlImplementationStatus,
  type ControlType,
  type GovernanceRecordStatus,
  type KpiFrequency,
  type PrismaClient,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../governance/code-generation.js";
import type { ControlListQuery } from "./validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

const personSelect = { id: true, code: true, fullName: true } as const;
const departmentSelect = { id: true, code: true, name: true } as const;

export const controlDetailInclude =
  Prisma.validator<Prisma.ControlInclude>()({
    owner: { select: personSelect },
    department: { select: departmentSelect },
  });

export type ControlRecord = Prisma.ControlGetPayload<{
  include: typeof controlDetailInclude;
}>;

export type ControlCounts = {
  activePolicyVersionMappingCount: number;
  activeFrameworkMappingCount: number;
  activeFrameworkRuleMappingCount: number;
  activeCheckpointCount: number;
  inactiveCheckpointCount: number;
  archivedCheckpointCount: number;
};

const writeAudit = (
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: "CONTROL";
    entityId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  },
) =>
  transaction.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ...(input.context.ip ? { ipAddress: input.context.ip } : {}),
      ...(input.context.userAgent
        ? { userAgent: input.context.userAgent }
        : {}),
    },
  });

export class ControlRepository {
  constructor(private readonly db: PrismaClient) {}

  findTenantUser(tenantId: string, userId: string) {
    return this.db.userCompany.findFirst({
      where: {
        tenantId,
        userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
  }

  findDepartment(tenantId: string, id: string) {
    return this.db.orgDepartment.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findActiveFrameworks(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([] as Array<{ id: string }>);
    return this.db.framework.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findActiveFrameworkRules(ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve(
        [] as Array<{ id: string; frameworkId: string; code: string; title: string }>,
      );
    }
    return this.db.frameworkRule.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      select: { id: true, frameworkId: true, code: true, title: true },
    });
  }

  findPolicyVersionsByIds(tenantId: string, ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve(
        [] as Array<{
          id: string;
          policyId: string;
          status: string;
          versionMajor: number;
          versionMinor: number;
          policy: { id: string; code: string; title: string; tenantId: string };
        }>,
      );
    }
    return this.db.policyVersion.findMany({
      where: { tenantId, id: { in: ids } },
      select: {
        id: true,
        policyId: true,
        status: true,
        versionMajor: true,
        versionMinor: true,
        policy: {
          select: { id: true, code: true, title: true, tenantId: true },
        },
      },
    });
  }

  findControl(
    tenantId: string,
    controlId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.control.findFirst({
      where: { tenantId, id: controlId },
      include: controlDetailInclude,
    });
  }

  async getControlCounts(
    tenantId: string,
    controlIds: string[],
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ): Promise<Map<string, ControlCounts>> {
    const empty = (): ControlCounts => ({
      activePolicyVersionMappingCount: 0,
      activeFrameworkMappingCount: 0,
      activeFrameworkRuleMappingCount: 0,
      activeCheckpointCount: 0,
      inactiveCheckpointCount: 0,
      archivedCheckpointCount: 0,
    });
    const result = new Map<string, ControlCounts>(
      controlIds.map((id) => [id, empty()]),
    );
    if (controlIds.length === 0) return result;

    const [
      policyCounts,
      frameworkCounts,
      ruleCounts,
      checkpointGroups,
    ] = await Promise.all([
      client.controlPolicyVersion.groupBy({
        by: ["controlId"],
        where: {
          tenantId,
          controlId: { in: controlIds },
          isActive: true,
        },
        _count: { _all: true },
      }),
      client.controlFramework.groupBy({
        by: ["controlId"],
        where: {
          tenantId,
          controlId: { in: controlIds },
          isActive: true,
        },
        _count: { _all: true },
      }),
      client.ruleControl.groupBy({
        by: ["controlId"],
        where: {
          tenantId,
          controlId: { in: controlIds },
          isActive: true,
        },
        _count: { _all: true },
      }),
      client.checkpoint.groupBy({
        by: ["controlId", "lifecycleStatus"],
        where: { tenantId, controlId: { in: controlIds } },
        _count: { _all: true },
      }),
    ]);

    for (const row of policyCounts) {
      const counts = result.get(row.controlId);
      if (counts) counts.activePolicyVersionMappingCount = row._count._all;
    }
    for (const row of frameworkCounts) {
      const counts = result.get(row.controlId);
      if (counts) counts.activeFrameworkMappingCount = row._count._all;
    }
    for (const row of ruleCounts) {
      const counts = result.get(row.controlId);
      if (counts) counts.activeFrameworkRuleMappingCount = row._count._all;
    }
    for (const row of checkpointGroups) {
      const counts = result.get(row.controlId);
      if (!counts) continue;
      if (row.lifecycleStatus === "ACTIVE") {
        counts.activeCheckpointCount = row._count._all;
      } else if (row.lifecycleStatus === "INACTIVE") {
        counts.inactiveCheckpointCount = row._count._all;
      } else {
        counts.archivedCheckpointCount = row._count._all;
      }
    }
    return result;
  }

  private needsMappingFilter(query: ControlListQuery) {
    return Boolean(
      query.policyId ||
        query.policyVersionId ||
        query.frameworkId ||
        query.frameworkRuleId,
    );
  }

  private controlListWhere(
    tenantId: string,
    query: ControlListQuery,
  ): Prisma.ControlWhereInput {
    return {
      tenantId,
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.implementationStatus
        ? { implementationStatus: query.implementationStatus }
        : {}),
      ...(query.controlType ? { controlType: query.controlType } : {}),
      ...(query.frequency ? { frequency: query.frequency } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.requiresEvidence !== undefined
        ? { requiresEvidence: query.requiresEvidence }
        : {}),
      ...(query.code
        ? { code: { equals: query.code, mode: "insensitive" } }
        : {}),
      ...(query.title
        ? { title: { contains: query.title, mode: "insensitive" } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { title: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.reviewDueFrom || query.reviewDueTo
        ? {
            nextReviewDate: {
              ...(query.reviewDueFrom
                ? { gte: new Date(`${query.reviewDueFrom}T00:00:00.000Z`) }
                : {}),
              ...(query.reviewDueTo
                ? { lte: new Date(`${query.reviewDueTo}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.policyId
        ? {
            policyVersionMappings: {
              some: {
                tenantId,
                policyId: query.policyId,
                isActive: true,
              },
            },
          }
        : {}),
      ...(query.policyVersionId
        ? {
            policyVersionMappings: {
              some: {
                tenantId,
                policyVersionId: query.policyVersionId,
                isActive: true,
              },
            },
          }
        : {}),
      ...(query.frameworkId
        ? {
            frameworkMappings: {
              some: {
                tenantId,
                frameworkId: query.frameworkId,
                isActive: true,
              },
            },
          }
        : {}),
      ...(query.frameworkRuleId
        ? {
            frameworkMappings: {
              some: {
                tenantId,
                isActive: true,
                ruleControls: {
                  some: {
                    tenantId,
                    frameworkRuleId: query.frameworkRuleId,
                    isActive: true,
                  },
                },
              },
            },
          }
        : {}),
    };
  }

  async listControls(tenantId: string, query: ControlListQuery) {
    const where = this.controlListWhere(tenantId, query);
    // Mapping filters use Prisma relation filters (accurate counts; no N+1).
    void this.needsMappingFilter(query);
    const [items, total] = await this.db.$transaction([
      this.db.control.findMany({
        where,
        include: controlDetailInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ code: "asc" }, { id: "asc" }],
      }),
      this.db.control.count({ where }),
    ]);
    const counts = await this.getControlCounts(
      tenantId,
      items.map((item) => item.id),
    );
    return {
      items: items as ControlRecord[],
      total,
      counts,
    };
  }

  async listAuditEvents(
    tenantId: string,
    controlId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      entityType: "CONTROL",
      entityId: controlId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return { items, total };
  }

  async getTraceability(tenantId: string, controlId: string) {
    const control = await this.findControl(tenantId, controlId);
    if (!control) return null;

    const [policyMappings, frameworkMappings, ruleMappings, counts] =
      await Promise.all([
        this.db.controlPolicyVersion.findMany({
          where: { tenantId, controlId },
          include: {
            policyVersion: {
              select: {
                id: true,
                policyId: true,
                status: true,
                versionMajor: true,
                versionMinor: true,
                sequence: true,
                policy: {
                  select: { id: true, code: true, title: true },
                },
              },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.db.controlFramework.findMany({
          where: { tenantId, controlId },
          include: {
            framework: {
              select: { id: true, code: true, name: true, version: true },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.db.ruleControl.findMany({
          where: { tenantId, controlId },
          include: {
            frameworkRule: {
              select: {
                id: true,
                frameworkId: true,
                code: true,
                title: true,
              },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.getControlCounts(tenantId, [controlId]),
      ]);

    return {
      control,
      policyMappings,
      frameworkMappings,
      ruleMappings,
      counts: counts.get(controlId)!,
    };
  }

  createControlWithMappings(input: {
    tenantId: string;
    actorUserId: string;
    title: string;
    description: string | null;
    objective: string;
    ownerId: string | null;
    departmentId: string | null;
    implementationStatus: ControlImplementationStatus;
    implementationNotes: string | null;
    controlType: ControlType;
    frequency: KpiFrequency;
    verificationMethod: string;
    requiresEvidence: boolean;
    lastReviewDate: Date | null;
    nextReviewDate: Date | null;
    policyVersions: Array<{ policyId: string; policyVersionId: string }>;
    frameworkIds: string[];
    frameworkRules: Array<{ frameworkId: string; frameworkRuleId: string }>;
    context: AuditContext;
    mappingAudits: Array<{
      mappingType: "POLICY_VERSION" | "FRAMEWORK" | "FRAMEWORK_RULE";
      addedIds: string[];
      activeCount: number;
    }>;
  }) {
    return this.db
      .$transaction(async (transaction) => {
        const codes = new GovernanceCodeRepository(transaction);
        const existingCodes = await transaction.control.findMany({
          where: { tenantId: input.tenantId },
          select: { code: true },
        });
        const maxAllocated = existingCodes.reduce((max, row) => {
          const match = /^CTL-(\d+)$/.exec(row.code);
          if (!match) return max;
          return Math.max(max, Number(match[1]));
        }, 0);
        if (maxAllocated > 0) {
          await transaction.tenant.updateMany({
            where: {
              id: input.tenantId,
              nextControlNumber: { lte: maxAllocated },
            },
            data: { nextControlNumber: maxAllocated + 1 },
          });
        }
        const code = await codes.allocateControlCode(input.tenantId);
        const control = await transaction.control.create({
          data: {
            tenantId: input.tenantId,
            code,
            title: input.title,
            description: input.description,
            objective: input.objective,
            ownerId: input.ownerId,
            departmentId: input.departmentId,
            implementationStatus: input.implementationStatus,
            implementationNotes: input.implementationNotes,
            controlType: input.controlType,
            frequency: input.frequency,
            verificationMethod: input.verificationMethod,
            requiresEvidence: input.requiresEvidence,
            lifecycleStatus: "ACTIVE",
            lastReviewDate: input.lastReviewDate,
            nextReviewDate: input.nextReviewDate,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
        });

        if (input.policyVersions.length > 0) {
          await transaction.controlPolicyVersion.createMany({
            data: input.policyVersions.map((mapping) => ({
              tenantId: input.tenantId,
              controlId: control.id,
              policyId: mapping.policyId,
              policyVersionId: mapping.policyVersionId,
              isActive: true,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
            })),
          });
        }
        if (input.frameworkIds.length > 0) {
          await transaction.controlFramework.createMany({
            data: input.frameworkIds.map((frameworkId) => ({
              tenantId: input.tenantId,
              controlId: control.id,
              frameworkId,
              isActive: true,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
            })),
          });
        }
        if (input.frameworkRules.length > 0) {
          await transaction.ruleControl.createMany({
            data: input.frameworkRules.map((mapping) => ({
              tenantId: input.tenantId,
              controlId: control.id,
              frameworkId: mapping.frameworkId,
              frameworkRuleId: mapping.frameworkRuleId,
              isActive: true,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
            })),
          });
        }

        await writeAudit(transaction, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "CONTROL_CREATED",
          entityType: "CONTROL",
          entityId: control.id,
          metadata: { code },
          context: input.context,
        });
        for (const mappingAudit of input.mappingAudits) {
          await writeAudit(transaction, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: "CONTROL_MAPPINGS_CHANGED",
            entityType: "CONTROL",
            entityId: control.id,
            metadata: {
              code,
              mappingType: mappingAudit.mappingType,
              addedIds: [...mappingAudit.addedIds].sort(),
              removedIds: [],
              activeCount: mappingAudit.activeCount,
            },
            context: input.context,
          });
        }
        return control.id;
      })
      .then((controlId) => this.findControl(input.tenantId, controlId));
  }

  async runInTransaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(work);
  }

  lockControl(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    return transaction.$queryRaw<
      Array<{
        id: string;
        code: string;
        lifecycle_status: GovernanceRecordStatus;
        owner_id: string | null;
        implementation_status: ControlImplementationStatus;
        title: string;
        description: string | null;
        objective: string;
        department_id: string | null;
        implementation_notes: string | null;
        control_type: ControlType;
        frequency: KpiFrequency;
        verification_method: string;
        requires_evidence: boolean;
        last_review_date: Date | null;
        next_review_date: Date | null;
      }>
    >`
      SELECT id, code, lifecycle_status, owner_id, implementation_status,
             title, description, objective, department_id, implementation_notes,
             control_type, frequency, verification_method, requires_evidence,
             last_review_date, next_review_date
      FROM controls
      WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      FOR UPDATE
    `;
  }

  writeAudit = writeAudit;
}
