import { Router, type Request } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { TaskService } from "./service.js";
import {
  createTaskSchema,
  taskIdParamsSchema,
  taskListSchema,
  updateTaskSchema,
  type TaskListQuery,
} from "./validators.js";

const context = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const taskRoutes = (service: TaskService) => {
  const router = Router();

  router.get(
    "/",
    permit("registers:read"),
    validate(taskListSchema, "query"),
    asyncHandler(async (req, res) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as TaskListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );
  router.get(
    "/:taskId",
    permit("registers:read"),
    validate(taskIdParamsSchema, "params"),
    asyncHandler(async (req, res) =>
      ok(res, await service.get(req.auth!.tenantId, String(req.params.taskId))),
    ),
  );
  router.post(
    "/",
    permit("registers:write"),
    validate(createTaskSchema),
    asyncHandler(async (req, res) =>
      created(
        res,
        await service.create(
          req.auth!.tenantId,
          req.auth!.userId,
          req.body,
          context(req),
        ),
      ),
    ),
  );
  router.patch(
    "/:taskId",
    permit("registers:write"),
    validate(taskIdParamsSchema, "params"),
    validate(updateTaskSchema),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.taskId),
          req.auth!.userId,
          req.body,
          context(req),
        ),
      ),
    ),
  );
  router.delete(
    "/:taskId",
    permit("registers:write"),
    validate(taskIdParamsSchema, "params"),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.delete(
          req.auth!.tenantId,
          String(req.params.taskId),
          req.auth!.userId,
          context(req),
        ),
      ),
    ),
  );

  return router;
};
