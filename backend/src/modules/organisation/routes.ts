import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { notFound } from "../../common/errors/app-error.js";
import { created, ok, pageMeta } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";
import type { OrganisationRepository } from "./repository.js";

type OrganisationKind = "departments" | "locations" | "units";

const paramsSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.enum(["ACTIVE", "DISABLED", "INVITED", "LOCKED"]);
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric");
const nameSchema = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(200).nullable().optional();

const createDepartmentSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  headName: optionalText,
  status: statusSchema.default("ACTIVE"),
});

const updateDepartmentSchema = z
  .object({
    name: nameSchema.optional(),
    headName: optionalText,
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const createLocationSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  city: optionalText,
  state: optionalText,
  country: optionalText,
  type: optionalText,
  status: statusSchema.default("ACTIVE"),
});

const updateLocationSchema = z
  .object({
    name: nameSchema.optional(),
    city: optionalText,
    state: optionalText,
    country: optionalText,
    type: optionalText,
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const createUnitSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  status: statusSchema.default("ACTIVE"),
});

const updateUnitSchema = z
  .object({
    name: nameSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const stripTenant = <T extends { tenantId?: string }>(item: T) => {
  const { tenantId: _tenantId, ...rest } = item;
  void _tenantId;
  return rest;
};

const requestContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export class OrganisationService {
  constructor(
    private readonly provider: SharedMasterProvider,
    private readonly repository: OrganisationRepository,
  ) {}

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

  async createDepartment(
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof createDepartmentSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const department = await this.repository.createDepartment(
      tenantId,
      actorUserId,
      {
        code: body.code,
        name: body.name,
        headName: body.headName ?? null,
        status: body.status,
      },
      context,
    );
    return stripTenant(department);
  }

  async updateDepartment(
    id: string,
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof updateDepartmentSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const department = await this.repository.updateDepartment(
      id,
      tenantId,
      actorUserId,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.headName !== undefined ? { headName: body.headName } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      context,
    );
    if (!department) throw notFound("Department not found");
    return stripTenant(department);
  }

  async createLocation(
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof createLocationSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const location = await this.repository.createLocation(
      tenantId,
      actorUserId,
      {
        code: body.code,
        name: body.name,
        city: body.city ?? null,
        state: body.state ?? null,
        country: body.country ?? null,
        type: body.type ?? null,
        status: body.status,
      },
      context,
    );
    return stripTenant(location);
  }

  async updateLocation(
    id: string,
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof updateLocationSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const location = await this.repository.updateLocation(
      id,
      tenantId,
      actorUserId,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.state !== undefined ? { state: body.state } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      context,
    );
    if (!location) throw notFound("Location not found");
    return stripTenant(location);
  }

  async createUnit(
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof createUnitSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const unit = await this.repository.createUnit(
      tenantId,
      actorUserId,
      {
        code: body.code,
        name: body.name,
        status: body.status,
      },
      context,
    );
    return stripTenant(unit);
  }

  async updateUnit(
    id: string,
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof updateUnitSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    const unit = await this.repository.updateUnit(
      id,
      tenantId,
      actorUserId,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      context,
    );
    if (!unit) throw notFound("Organisation unit not found");
    return stripTenant(unit);
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

  createDepartment = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.createDepartment(
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );

  updateDepartment = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.updateDepartment(
        String(req.params.id),
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );

  createLocation = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.createLocation(
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );

  updateLocation = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.updateLocation(
        String(req.params.id),
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );

  createUnit = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.createUnit(
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );

  updateUnit = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.updateUnit(
        String(req.params.id),
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        requestContext(req),
      ),
    );
}

export const organisationRoutes = (
  provider: SharedMasterProvider,
  repository: OrganisationRepository,
) => {
  const router = Router();
  const controller = new OrganisationController(
    new OrganisationService(provider, repository),
  );
  router.use(authenticate);

  router.get(
    "/departments",
    permit("organisation:read"),
    validate(paginationSchema, "query"),
    controller.list("departments"),
  );
  router.post(
    "/departments",
    permit("departments:write"),
    validate(createDepartmentSchema),
    asyncHandler(controller.createDepartment),
  );
  router.patch(
    "/departments/:id",
    permit("departments:write"),
    validate(paramsSchema, "params"),
    validate(updateDepartmentSchema),
    asyncHandler(controller.updateDepartment),
  );

  router.get(
    "/locations",
    permit("organisation:read"),
    validate(paginationSchema, "query"),
    controller.list("locations"),
  );
  router.post(
    "/locations",
    permit("locations:write"),
    validate(createLocationSchema),
    asyncHandler(controller.createLocation),
  );
  router.patch(
    "/locations/:id",
    permit("locations:write"),
    validate(paramsSchema, "params"),
    validate(updateLocationSchema),
    asyncHandler(controller.updateLocation),
  );

  router.get(
    "/units",
    permit("organisation:read"),
    validate(paginationSchema, "query"),
    controller.list("units"),
  );
  router.post(
    "/units",
    permit("units:write"),
    validate(createUnitSchema),
    asyncHandler(controller.createUnit),
  );
  router.patch(
    "/units/:id",
    permit("units:write"),
    validate(paramsSchema, "params"),
    validate(updateUnitSchema),
    asyncHandler(controller.updateUnit),
  );

  return router;
};
