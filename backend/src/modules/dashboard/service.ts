import type { DashboardRepository } from "./repository.js";

const may = (permissions: readonly string[], permission: string) =>
  permissions.includes("*") || permissions.includes(permission);

/**
 * Dashboard sections preserve the same permission boundaries as their source
 * modules. A user without `risk:read`, for example, receives `risks: null`
 * rather than aggregate information about records they cannot list.
 */
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async summary(tenantId: string, permissions: readonly string[]) {
    const [kpis, risks, organisation, frameworks] = await Promise.all([
      may(permissions, "kpis:read")
        ? this.repository.kpis(tenantId)
        : Promise.resolve(null),
      may(permissions, "risk:read")
        ? this.repository.risks(tenantId)
        : Promise.resolve(null),
      may(permissions, "organisation:read")
        ? this.repository.organisation(tenantId)
        : Promise.resolve(null),
      may(permissions, "frameworks:read")
        ? this.repository.frameworks()
        : Promise.resolve(null),
    ]);
    return { kpis, risks, organisation, frameworks };
  }
}
