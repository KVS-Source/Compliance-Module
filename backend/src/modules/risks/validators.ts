import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const riskIdParamsSchema = z.object({ id: z.string().uuid() });

export const riskListSchema = paginationSchema.extend({
  status: z
    .enum(["OPEN", "UNDER_REVIEW", "TREATED", "CLOSED", "ARCHIVED"])
    .optional(),
  kpiRiskClass: z.enum(["MAJOR", "MINOR"]).optional(),
  generalLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export type RiskListQuery = z.infer<typeof riskListSchema>;
