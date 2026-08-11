import type { PrismaClient } from "@prisma/client";
import type {
  PageInput,
  PageResult,
  SharedMasterProvider,
} from "./provider.js";

const bounds = ({ page, pageSize }: PageInput) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export class LocalPostgresSharedMasterProvider implements SharedMasterProvider {
  constructor(private readonly db: PrismaClient) {}

  async listTenants(userId: string, page: PageInput) {
    const where = {
      status: "ACTIVE" as const,
      memberships: { some: { userId, status: "ACTIVE" as const } },
    };
    const [items, total] = await this.db.$transaction([
      this.db.tenant.findMany({
        where,
        ...bounds(page),
        orderBy: { code: "asc" },
      }),
      this.db.tenant.count({ where }),
    ]);
    return { items, total };
  }

  getTenant(id: string) {
    return this.db.tenant.findUnique({ where: { id } });
  }

  async listUsers(tenantId: string, page: PageInput) {
    const where = {
      memberships: { some: { tenantId, status: "ACTIVE" as const } },
    };
    const direction = page.order ?? "asc";
    const orderBy =
      page.orderBy === undefined
        ? { code: "asc" as const }
        : ({ [page.orderBy]: direction } as const);
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        ...bounds(page),
        orderBy,
      }),
      this.db.user.count({ where }),
    ]);
    const enriched = await this.db.user.findMany({
      where: { id: { in: items.map((item) => item.id) } },
      include: {
        memberships: {
          where: { tenantId, status: "ACTIVE" },
          include: { department: true },
        },
        roles: {
          where: { tenantId, status: "ACTIVE", role: { status: "ACTIVE" } },
          include: { role: true },
        },
      },
      orderBy,
    });
    return {
      items: enriched.map(({ memberships, roles, ...user }) => ({
        ...user,
        departmentName: memberships[0]?.department?.name ?? null,
        roleNames: roles.map((assignment) => assignment.role.name),
      })),
      total,
    };
  }

  listDepartments(tenantId: string, page: PageInput) {
    return this.listTenantModel("orgDepartment", tenantId, page);
  }

  listLocations(tenantId: string, page: PageInput) {
    return this.listTenantModel("orgLocation", tenantId, page);
  }

  listOrganisationUnits(tenantId: string, page: PageInput) {
    return this.listTenantModel("orgUnit", tenantId, page);
  }

  async listFrameworks(page: PageInput) {
    // Operational lists show only ACTIVE catalogue rows. DISABLED legacy
    // Legacy synthetic framework duplicates stay in the database for remapping
    // history but
    // must not appear beside workbook-named frameworks in filters.
    const where = { status: "ACTIVE" as const };
    const [items, total] = await this.db.$transaction([
      this.db.framework.findMany({
        where,
        ...bounds(page),
        orderBy: { code: "asc" },
      }),
      this.db.framework.count({ where }),
    ]);
    return { items, total };
  }

  async getFrameworkRules(frameworkId: string, page: PageInput) {
    // Matches `listFrameworks`: operational lists show only ACTIVE catalogue
    // rows. A retired rule stays in the database because governance mappings
    // reference it and cannot be repointed or deleted, but it must not appear
    // among a framework's live clauses.
    const where = { frameworkId, status: "ACTIVE" as const };
    const [items, total] = await this.db.$transaction([
      this.db.frameworkRule.findMany({
        where,
        ...bounds(page),
        orderBy: { code: "asc" },
      }),
      this.db.frameworkRule.count({ where }),
    ]);
    return { items, total };
  }

  async listKpiDefinitions(page: PageInput) {
    const [items, total] = await this.db.$transaction([
      this.db.kpiDefinition.findMany({
        ...bounds(page),
        orderBy: { code: "asc" },
      }),
      this.db.kpiDefinition.count(),
    ]);
    return { items, total };
  }

  async listKpiGoals(tenantId: string, page: PageInput) {
    const where = { tenantId };
    const [items, total] = await this.db.$transaction([
      this.db.kpiGoal.findMany({
        where,
        include: { definition: true },
        ...bounds(page),
        orderBy: { effectiveFrom: "desc" },
      }),
      this.db.kpiGoal.count({ where }),
    ]);
    return { items, total };
  }

  private async listTenantModel(
    model: "orgDepartment" | "orgLocation" | "orgUnit",
    tenantId: string,
    page: PageInput,
  ): Promise<PageResult<any>> {
    const repository = this.db[model] as any;
    const where = { tenantId };
    const [items, total] = await this.db.$transaction([
      repository.findMany({ where, ...bounds(page), orderBy: { code: "asc" } }),
      repository.count({ where }),
    ]);
    return { items, total };
  }
}
