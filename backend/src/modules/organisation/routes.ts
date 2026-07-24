import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok, pageMeta } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";

type OrganisationKind = "departments" | "locations" | "units";

export class OrganisationService {
  constructor(private readonly provider: SharedMasterProvider) {}

  async list(kind: OrganisationKind, tenantId: string, pagination: Pagination) {
    const result =
      kind === "departments"
        ? await this.provider.listDepartments(tenantId, pagination)
        : kind === "locations"
          ? await this.provider.listLocations(tenantId, pagination)
          : await this.provider.listOrganisationUnits(tenantId, pagination);
    return {
      data: result.items.map((item) => ({
        ...item,
        companyId: undefined,
        tenantId: undefined,
      })),
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
}

export class OrganisationController {
  constructor(private readonly service: OrganisationService) {}
  list = (kind: OrganisationKind) =>
    asyncHandler(async (req: Request, res: Response) => {
      const result = await this.service.list(
        kind,
        req.auth!.tenantId,
        req.query as unknown as Pagination,
      );
      return ok(res, result.data, result.meta);
    });
}

export const organisationRoutes = (provider: SharedMasterProvider) => {
  const router = Router();
  const controller = new OrganisationController(
    new OrganisationService(provider),
  );
  router.use(authenticate, permit("organisation:read"));
  router.get(
    "/departments",
    validate(paginationSchema, "query"),
    controller.list("departments"),
  );
  router.get(
    "/locations",
    validate(paginationSchema, "query"),
    controller.list("locations"),
  );
  router.get(
    "/units",
    validate(paginationSchema, "query"),
    controller.list("units"),
  );
  return router;
};
