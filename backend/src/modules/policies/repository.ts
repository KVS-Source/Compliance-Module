import {
  Prisma,
  type GovernanceRecordStatus,
  type PolicyVersionStatus,
  type PrismaClient,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../governance/code-generation.js";
import type { PolicyListQuery } from "./validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

const personSelect = { id: true, code: true, fullName: true } as const;

export const policyVersionInclude =
  Prisma.validator<Prisma.PolicyVersionInclude>()({
    requestedApprover: { select: personSelect },
    submittedBy: { select: personSelect },
    approvedBy: { select: personSelect },
    frameworkMappings: {
      where: { isActive: true },
      include: {
        framework: {
          select: { id: true, code: true, name: true, version: true },
        },
      },
      orderBy: { createdAt: "asc" },
    },
  });

export const policyDetailInclude =
  Prisma.validator<Prisma.PolicyInclude>()({
    owner: { select: personSelect },
    department: {
      select: { id: true, code: true, name: true },
    },
    currentApprovedVersion: { include: policyVersionInclude },
    versions: {
      include: policyVersionInclude,
      orderBy: [{ sequence: "desc" }],
      take: 1,
    },
  });

export type PolicyVersionRecord = Prisma.PolicyVersionGetPayload<{
  include: typeof policyVersionInclude;
}>;

export type PolicyDetailRecord = Prisma.PolicyGetPayload<{
  include: typeof policyDetailInclude;
}>;

export type PolicyListRecord = Prisma.PolicyGetPayload<{
  include: {
    owner: { select: typeof personSelect };
    department: { select: { id: true; code: true; name: true } };
    currentApprovedVersion: { include: typeof policyVersionInclude };
    versions: { include: typeof policyVersionInclude };
  };
}>;

const writeAudit = (
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: "POLICY" | "POLICY_VERSION";
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

export class PolicyRepository {
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

  findPolicy(
    tenantId: string,
    policyId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.policy.findFirst({
      where: { tenantId, id: policyId },
      include: policyDetailInclude,
    });
  }

  findPolicyRow(tenantId: string, policyId: string) {
    return this.db.policy.findFirst({
      where: { tenantId, id: policyId },
    });
  }

  findVersion(
    tenantId: string,
    versionId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.policyVersion.findFirst({
      where: { tenantId, id: versionId },
      include: {
        ...policyVersionInclude,
        policy: true,
      },
    });
  }

  findVersionForPolicy(
    tenantId: string,
    policyId: string,
    versionId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.policyVersion.findFirst({
      where: { tenantId, policyId, id: versionId },
      include: policyVersionInclude,
    });
  }

  private policyListWhere(
    tenantId: string,
    query: PolicyListQuery,
  ): Prisma.PolicyWhereInput {
    return {
      tenantId,
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
            currentApprovedVersion: {
              is: {
                tenantId,
                reviewDate: {
                  ...(query.reviewDueFrom
                    ? { gte: new Date(`${query.reviewDueFrom}T00:00:00.000Z`) }
                    : {}),
                  ...(query.reviewDueTo
                    ? { lte: new Date(`${query.reviewDueTo}T00:00:00.000Z`) }
                    : {}),
                },
              },
            },
          }
        : {}),
    };
  }

  private policyListInclude() {
    return {
      owner: { select: personSelect },
      department: { select: { id: true, code: true, name: true } },
      currentApprovedVersion: { include: policyVersionInclude },
      versions: {
        include: policyVersionInclude,
        orderBy: [{ sequence: "desc" as const }],
        take: 1,
      },
    };
  }

  /**
   * Tenant-scoped policy IDs whose latest Version matches versionStatus
   * and/or frameworkId. Uses SQL so count and page are accurate.
   */
  private async listPolicyIdsByLatestVersionFilters(
    tenantId: string,
    query: PolicyListQuery,
  ): Promise<{ ids: string[]; total: number }> {
    const filters: Prisma.Sql[] = [Prisma.sql`p.tenant_id = ${tenantId}::uuid`];

    if (query.lifecycleStatus) {
      filters.push(
        Prisma.sql`p.lifecycle_status = ${query.lifecycleStatus}::"GovernanceRecordStatus"`,
      );
    }
    if (query.ownerId) {
      filters.push(Prisma.sql`p.owner_id = ${query.ownerId}::uuid`);
    }
    if (query.departmentId) {
      filters.push(Prisma.sql`p.department_id = ${query.departmentId}::uuid`);
    }
    if (query.code) {
      filters.push(Prisma.sql`lower(p.code) = lower(${query.code})`);
    }
    if (query.title) {
      filters.push(Prisma.sql`p.title ILIKE ${`%${query.title}%`}`);
    }
    if (query.q) {
      const pattern = `%${query.q}%`;
      filters.push(
        Prisma.sql`(p.code ILIKE ${pattern} OR p.title ILIKE ${pattern})`,
      );
    }
    if (query.reviewDueFrom) {
      filters.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM policy_versions cav
          WHERE cav.tenant_id = p.tenant_id
            AND cav.id = p.current_approved_version_id
            AND cav.review_date >= ${new Date(`${query.reviewDueFrom}T00:00:00.000Z`)}
        )
      `);
    }
    if (query.reviewDueTo) {
      filters.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM policy_versions cav
          WHERE cav.tenant_id = p.tenant_id
            AND cav.id = p.current_approved_version_id
            AND cav.review_date <= ${new Date(`${query.reviewDueTo}T00:00:00.000Z`)}
        )
      `);
    }

    const latestPredicates: Prisma.Sql[] = [];
    if (query.versionStatus) {
      latestPredicates.push(
        Prisma.sql`lv.status = ${query.versionStatus}::"PolicyVersionStatus"`,
      );
    }
    if (query.frameworkId) {
      latestPredicates.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM policy_frameworks pf
          WHERE pf.tenant_id = lv.tenant_id
            AND pf.policy_version_id = lv.id
            AND pf.framework_id = ${query.frameworkId}::uuid
            AND pf.is_active = true
        )
      `);
    }

    const whereSql = Prisma.join(filters, " AND ");
    const latestSql = Prisma.join(latestPredicates, " AND ");
    const skip = (query.page - 1) * query.pageSize;

    const [countRows, idRows] = await this.db.$transaction([
      this.db.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS total
        FROM policies p
        INNER JOIN LATERAL (
          SELECT pv.id, pv.tenant_id, pv.status
          FROM policy_versions pv
          WHERE pv.tenant_id = p.tenant_id AND pv.policy_id = p.id
          ORDER BY pv.sequence DESC
          LIMIT 1
        ) lv ON true
        WHERE ${whereSql}
          AND ${latestSql}
      `,
      this.db.$queryRaw<Array<{ id: string }>>`
        SELECT p.id
        FROM policies p
        INNER JOIN LATERAL (
          SELECT pv.id, pv.tenant_id, pv.status
          FROM policy_versions pv
          WHERE pv.tenant_id = p.tenant_id AND pv.policy_id = p.id
          ORDER BY pv.sequence DESC
          LIMIT 1
        ) lv ON true
        WHERE ${whereSql}
          AND ${latestSql}
        ORDER BY p.code ASC
        OFFSET ${skip}
        LIMIT ${query.pageSize}
      `,
    ]);

    return {
      ids: idRows.map((row) => row.id),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async listPolicies(tenantId: string, query: PolicyListQuery) {
    const needsLatestFilter = Boolean(query.versionStatus || query.frameworkId);
    const include = this.policyListInclude();

    if (needsLatestFilter) {
      const { ids, total } = await this.listPolicyIdsByLatestVersionFilters(
        tenantId,
        query,
      );
      if (ids.length === 0) {
        return { items: [] as PolicyListRecord[], total };
      }
      const unordered = (await this.db.policy.findMany({
        where: { tenantId, id: { in: ids } },
        include,
      })) as PolicyListRecord[];
      const byId = new Map(unordered.map((policy) => [policy.id, policy]));
      return {
        items: ids
          .map((id) => byId.get(id))
          .filter((policy): policy is PolicyListRecord => Boolean(policy)),
        total,
      };
    }

    const where = this.policyListWhere(tenantId, query);
    const [items, total] = await this.db.$transaction([
      this.db.policy.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy:
          query.orderBy === undefined
            ? [{ code: "asc" }]
            : [{ [query.orderBy]: query.order ?? "asc" }, { code: "asc" }],
      }),
      this.db.policy.count({ where }),
    ]);

    return { items: items as PolicyListRecord[], total };
  }

  listVersions(tenantId: string, policyId: string) {
    return this.db.policyVersion.findMany({
      where: { tenantId, policyId },
      include: policyVersionInclude,
      orderBy: [{ sequence: "desc" }],
    });
  }

  async listAuditEvents(
    tenantId: string,
    policyId: string,
    page: number,
    pageSize: number,
  ) {
    const versions = await this.db.policyVersion.findMany({
      where: { tenantId, policyId },
      select: { id: true },
    });
    const entityIds = [policyId, ...versions.map((version) => version.id)];
    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      entityType: { in: ["POLICY", "POLICY_VERSION"] },
      entityId: { in: entityIds },
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

  async getTraceability(tenantId: string, policyId: string) {
    const policy = await this.findPolicy(tenantId, policyId);
    if (!policy) return null;
    const latest = policy.versions[0] ?? null;
    const focus = policy.currentApprovedVersion ?? latest;
    const controlMappings = focus
      ? await this.db.controlPolicyVersion.findMany({
          where: {
            tenantId,
            policyId,
            policyVersionId: focus.id,
            isActive: true,
          },
          include: {
            control: {
              select: {
                id: true,
                code: true,
                title: true,
                lifecycleStatus: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    return { policy, focusVersion: focus, controlMappings };
  }

  createPolicyWithInitialVersion(input: {
    tenantId: string;
    actorUserId: string;
    title: string;
    description: string | null;
    ownerId: string | null;
    departmentId: string | null;
    content: string;
    purpose: string | null;
    scope: string | null;
    changeSummary: string | null;
    effectiveDate: Date | null;
    reviewDate: Date | null;
    requiresEvidence: boolean;
    requestedApproverId: string | null;
    frameworkIds: string[];
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const codes = new GovernanceCodeRepository(transaction);
      const existingCodes = await transaction.policy.findMany({
        where: { tenantId: input.tenantId },
        select: { code: true },
      });
      const maxAllocated = existingCodes.reduce((max, row) => {
        const match = /^POL-(\d+)$/.exec(row.code);
        if (!match) return max;
        return Math.max(max, Number(match[1]));
      }, 0);
      if (maxAllocated > 0) {
        await transaction.tenant.updateMany({
          where: {
            id: input.tenantId,
            nextPolicyNumber: { lte: maxAllocated },
          },
          data: { nextPolicyNumber: maxAllocated + 1 },
        });
      }
      const code = await codes.allocatePolicyCode(input.tenantId);
      const policy = await transaction.policy.create({
        data: {
          tenantId: input.tenantId,
          code,
          title: input.title,
          description: input.description,
          ownerId: input.ownerId,
          departmentId: input.departmentId,
          lifecycleStatus: "ACTIVE",
          nextVersionSequence: 2,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
      });
      const version = await transaction.policyVersion.create({
        data: {
          tenantId: input.tenantId,
          policyId: policy.id,
          sequence: 1,
          versionMajor: 1,
          versionMinor: 0,
          content: input.content,
          purpose: input.purpose,
          scope: input.scope,
          changeSummary: input.changeSummary,
          status: "DRAFT",
          effectiveDate: input.effectiveDate,
          reviewDate: input.reviewDate,
          requiresEvidence: input.requiresEvidence,
          requestedApproverId: input.requestedApproverId,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
      });
      if (input.frameworkIds.length > 0) {
        await transaction.policyFramework.createMany({
          data: input.frameworkIds.map((frameworkId) => ({
            tenantId: input.tenantId,
            policyId: policy.id,
            policyVersionId: version.id,
            frameworkId,
            isActive: true,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          })),
        });
      }
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "POLICY_CREATED",
        entityType: "POLICY",
        entityId: policy.id,
        metadata: { code },
        context: input.context,
      });
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "POLICY_VERSION_CREATED",
        entityType: "POLICY_VERSION",
        entityId: version.id,
        metadata: { code, version: "1.0", toStatus: "DRAFT" },
        context: input.context,
      });
      if (input.frameworkIds.length > 0) {
        await writeAudit(transaction, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "POLICY_FRAMEWORKS_CHANGED",
          entityType: "POLICY_VERSION",
          entityId: version.id,
          metadata: {
            code,
            version: "1.0",
            frameworkCount: input.frameworkIds.length,
            frameworkIds: input.frameworkIds,
          },
          context: input.context,
        });
      }
      return policy.id;
    }).then((policyId) => this.findPolicy(input.tenantId, policyId));
  }

  async runInTransaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(work);
  }

  lockPolicy(transaction: Prisma.TransactionClient, tenantId: string, id: string) {
    return transaction.$queryRaw<
      Array<{
        id: string;
        code: string;
        lifecycle_status: GovernanceRecordStatus;
        current_approved_version_id: string | null;
        next_version_sequence: number;
      }>
    >`
      SELECT id, code, lifecycle_status, current_approved_version_id, next_version_sequence
      FROM policies
      WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      FOR UPDATE
    `;
  }

  lockVersion(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ) {
    return transaction.$queryRaw<
      Array<{
        id: string;
        policy_id: string;
        status: PolicyVersionStatus;
        sequence: number;
        version_major: number;
        version_minor: number;
        submitted_by_id: string | null;
        requested_approver_id: string | null;
        requires_evidence: boolean;
        effective_date: Date | null;
        review_date: Date | null;
      }>
    >`
      SELECT id, policy_id, status, sequence, version_major, version_minor,
             submitted_by_id, requested_approver_id, requires_evidence,
             effective_date, review_date
      FROM policy_versions
      WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
      FOR UPDATE
    `;
  }

  writeAudit = writeAudit;
}
