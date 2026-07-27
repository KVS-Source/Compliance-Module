export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "GenBioCa Compliance Platform API",
    version: "1.0.0",
    description:
      "Milestone 1 authentication, Company context and shared-master read APIs.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "genbioca_refresh" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Process liveness",
        responses: { "200": { description: "Application process is live" } },
      },
    },
    "/ready": {
      get: {
        summary: "Database-backed readiness",
        responses: {
          "200": { description: "Application and database are ready" },
          "503": { description: "Application is not ready" },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Sign in",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Authenticated" },
          "401": { description: "Invalid login" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotate refresh token",
        responses: { "200": { description: "Rotated" } },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Revoke session",
        security: [{ refreshCookie: [] }],
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Current identity" } },
      },
    },
    "/auth/tenant-context": {
      post: {
        summary: "Switch Company context",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Context switched" } },
      },
    },
    "/tenants": {
      get: {
        summary: "List Companies",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Company page" } },
      },
    },
    "/users": {
      get: {
        summary: "List Company users",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User page" } },
      },
      post: {
        summary: "Create a Company user",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "User created with tenant membership" },
          "403": { description: "Missing users:write permission" },
          "409": { description: "Duplicate email or code" },
        },
      },
    },
    "/users/{id}": {
      get: {
        summary: "Get Company user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User" } },
      },
      patch: {
        summary: "Update a Company user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User updated" },
          "403": { description: "Missing users:write permission" },
          "404": { description: "User not in active Company context" },
          "409": { description: "Duplicate email or code" },
        },
      },
    },
    "/organisation/departments": {
      get: {
        summary: "List departments",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Department page" } },
      },
      post: {
        summary: "Create a department",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Department created" },
          "403": { description: "Missing departments:write permission" },
          "409": { description: "Duplicate department code in Company" },
        },
      },
    },
    "/organisation/departments/{id}": {
      patch: {
        summary: "Update a department",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Department updated" },
          "403": { description: "Missing departments:write permission" },
          "404": { description: "Department not in active Company context" },
          "409": { description: "Duplicate department code in Company" },
        },
      },
    },
    "/organisation/locations": {
      get: {
        summary: "List locations",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Location page" } },
      },
      post: {
        summary: "Create a location",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Location created" },
          "403": { description: "Missing locations:write permission" },
          "409": { description: "Duplicate location code in Company" },
        },
      },
    },
    "/organisation/locations/{id}": {
      patch: {
        summary: "Update a location",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Location updated" },
          "403": { description: "Missing locations:write permission" },
          "404": { description: "Location not in active Company context" },
          "409": { description: "Duplicate location code in Company" },
        },
      },
    },
    "/organisation/units": {
      get: {
        summary: "List organisation units",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Unit page" } },
      },
      post: {
        summary: "Create an organisation unit",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Organisation unit created" },
          "403": { description: "Missing units:write permission" },
          "409": { description: "Duplicate unit code in Company" },
        },
      },
    },
    "/organisation/units/{id}": {
      patch: {
        summary: "Update an organisation unit",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Organisation unit updated" },
          "403": { description: "Missing units:write permission" },
          "404": { description: "Unit not in active Company context" },
          "409": { description: "Duplicate unit code in Company" },
        },
      },
    },
    "/frameworks": {
      get: {
        summary: "List frameworks",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Framework page" } },
      },
    },
    "/frameworks/{id}": {
      get: {
        summary: "Get framework",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Framework" } },
      },
    },
    "/frameworks/{id}/rules": {
      get: {
        summary: "List framework rules",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Rule page" } },
      },
    },
    "/kpi-definitions": {
      get: {
        summary: "List KPI catalogue",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "KPI page" } },
      },
    },
    "/kpi-goals": {
      get: {
        summary: "List legacy Company KPI goals",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Goal page" } },
      },
    },
    "/kpi-configurations": {
      get: {
        summary: "List Company KPI configurations",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "KPI configuration page" } },
      },
      post: {
        summary: "Create a Company KPI configuration",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "KPI configuration created" },
          "403": { description: "Missing kpi-config:write permission" },
          "409": { description: "Active configuration scope already exists" },
        },
      },
    },
    "/kpi-configurations/threshold-defaults": {
      get: {
        summary: "Get Company default amber and red KPI thresholds",
        description:
          "Read-only Company defaults applied when a configuration leaves amberThresholdPct or redThresholdPct null.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Company threshold defaults" },
          "403": { description: "Missing kpis:read permission" },
        },
      },
    },
    "/kpi-configurations/{id}": {
      get: {
        summary: "Get a Company KPI configuration",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI configuration" },
          "404": { description: "Configuration not in Company context" },
        },
      },
      patch: {
        summary: "Update a Company KPI configuration",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI configuration updated" },
          "403": { description: "Missing kpi-config:write permission" },
          "404": { description: "Configuration not in Company context" },
          "409": { description: "Active configuration scope already exists" },
        },
      },
      delete: {
        summary: "Soft-delete a Company KPI configuration",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI configuration disabled and deleted" },
          "403": { description: "Missing kpi-config:write permission" },
          "404": { description: "Configuration not in Company context" },
        },
      },
    },
    "/kpi-targets": {
      get: {
        summary: "List Company KPI targets",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "KPI target page" } },
      },
      post: {
        summary: "Create a draft Company KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "KPI target created" },
          "403": { description: "Missing kpi-target:write permission" },
          "409": { description: "Target code, period or version conflict" },
        },
      },
    },
    "/kpi-targets/{id}": {
      get: {
        summary: "Get a Company KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target" },
          "404": { description: "Target not in Company context" },
        },
      },
      patch: {
        summary: "Update a draft or rejected KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target updated" },
          "403": { description: "Missing kpi-target:write permission" },
          "409": { description: "Target state does not permit editing" },
        },
      },
      delete: {
        summary: "Soft-delete a draft or rejected KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target disabled and deleted" },
          "403": { description: "Missing kpi-target:write permission" },
          "409": { description: "Target state does not permit deletion" },
        },
      },
    },
    "/kpi-targets/{id}/submit": {
      post: {
        summary: "Submit a KPI target for approval or auto-approval",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target submitted" },
          "403": {
            description: "Missing permission or configured approver submitted",
          },
          "409": { description: "Target state does not permit submission" },
        },
      },
    },
    "/kpi-targets/{id}/approve": {
      post: {
        summary: "Approve a pending KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target approved" },
          "403": {
            description:
              "Missing permission, self-approval, or wrong configured approver",
          },
          "409": { description: "Target is not pending approval" },
        },
      },
    },
    "/kpi-targets/{id}/reject": {
      post: {
        summary: "Reject a pending KPI target with a reason",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI target rejected" },
          "403": {
            description:
              "Missing permission, self-approval, or wrong configured approver",
          },
          "409": { description: "Target is not pending approval" },
        },
      },
    },
    "/kpi-targets/{id}/versions": {
      post: {
        summary: "Create a new draft version from an approved KPI target",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "New KPI target version created" },
          "403": { description: "Missing kpi-target:write permission" },
          "409": {
            description: "Target is not approved or already superseded",
          },
        },
      },
    },
    "/kpi-actuals": {
      get: {
        summary: "List Company KPI actuals",
        description:
          "Read-only. Filters: approvalStatus, kpiConfigurationId, kpiDefinitionId, ragStatus, and awaitingMyDecision, which narrows to rows the authenticated user may decide. Each row carries its append-only kpi_approvals history and any linked risk.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI actual page" },
          "403": { description: "Missing kpis:read permission" },
        },
      },
      post: {
        summary: "Submit a Company KPI actual against an approved target",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["kpiConfigurationId", "period", "actualValue"],
                properties: {
                  kpiConfigurationId: {
                    type: "string",
                    format: "uuid",
                  },
                  period: { type: "string", maxLength: 64 },
                  actualValue: {
                    type: "string",
                    pattern: "^-?\\d{1,14}(?:\\.\\d{1,4})?$",
                  },
                  evidenceStatus: {
                    type: "string",
                    nullable: true,
                    maxLength: 64,
                  },
                  comments: {
                    type: "string",
                    nullable: true,
                    maxLength: 2_000,
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description:
              "KPI actual submitted into pending approval or automatically approved with its server-allocated ACT code, target snapshot, performance result and automatic risk summary when required",
          },
          "400": {
            description:
              "Invalid input, a caller-supplied code, or calculated values exceed Decimal(18,4)",
          },
          "403": { description: "Missing kpi-actual:write permission" },
          "404": {
            description:
              "Configuration unavailable or no approved target for the period",
          },
          "409": {
            description:
              "KPI_ACTUAL_PERIOD_EXISTS: an active actual already exists for the configuration and period",
          },
          "501": {
            description:
              "Automatic approval requires evidence support that is not implemented",
          },
        },
      },
    },
    "/kpi-actuals/{id}": {
      get: {
        summary: "Get a Company KPI actual with its approval history",
        description:
          "Read-only. The approvals array is the append-only kpi_approvals ledger in decision order, enforced by the kpi_approvals_append_only database trigger.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "KPI actual with approval history" },
          "403": { description: "Missing kpis:read permission" },
          "404": { description: "Actual not in Company context" },
        },
      },
    },
    "/kpi-actuals/{id}/approve": {
      post: {
        summary: "Approve a submitted Company KPI actual",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  comments: { type: "string", maxLength: 2_000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "KPI actual approved" },
          "403": {
            description:
              "Missing kpi-actual:approve, self-approval, or wrong configured approver",
          },
          "404": { description: "KPI actual not in the active Company" },
          "409": {
            description: "KPI actual is not awaiting an approval decision",
          },
          "501": {
            description:
              "Approval requires evidence support that is not implemented",
          },
        },
      },
    },
    "/kpi-actuals/{id}/reject": {
      post: {
        summary: "Reject a submitted Company KPI actual",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["reason"],
                properties: {
                  reason: { type: "string", maxLength: 2_000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "KPI actual rejected" },
          "403": {
            description:
              "Missing kpi-actual:approve, self-approval, or wrong configured approver",
          },
          "404": { description: "KPI actual not in the active Company" },
          "409": {
            description: "KPI actual is not awaiting an approval decision",
          },
        },
      },
    },
    "/kpi-actuals/{id}/resubmit": {
      post: {
        summary: "Resubmit a rejected Company KPI actual without changing data",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  comments: { type: "string", maxLength: 2_000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "KPI actual resubmitted into pending approval or automatically approved",
          },
          "403": {
            description:
              "Missing kpi-actual:write or actor is not the original submitter",
          },
          "404": { description: "KPI actual not in the active Company" },
          "409": { description: "KPI actual is not rejected" },
          "501": {
            description:
              "Automatic approval requires evidence support that is not implemented",
          },
        },
      },
    },
    "/risks": {
      get: {
        summary: "List Company risks",
        description:
          "Tenant-filtered, paginated Risk Register. " +
          "When both status and lifecycle are supplied, status takes precedence " +
          "and lifecycle is ignored for status filtering. " +
          "lifecycle=active → OPEN|UNDER_REVIEW|TREATED; " +
          "lifecycle=closed → CLOSED|ARCHIVED; lifecycle=all → no status group. " +
          "Omitting both returns all non-deleted statuses. " +
          "q is trimmed, max 100 chars, case-insensitive over risk title, risk code, " +
          "linked KPI code and KPI name. " +
          "source.actual may include additive actualValue, variance and " +
          "targetValueSnapshot strings when a KPI actual is linked.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "page",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            in: "query",
            name: "pageSize",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
          {
            in: "query",
            name: "status",
            description:
              "Exact RiskStatus. Takes precedence over lifecycle when both are set.",
            schema: {
              type: "string",
              enum: ["OPEN", "UNDER_REVIEW", "TREATED", "CLOSED", "ARCHIVED"],
            },
          },
          {
            in: "query",
            name: "lifecycle",
            description:
              "Status group filter. Ignored when status is also supplied. " +
              "active=OPEN|UNDER_REVIEW|TREATED; closed=CLOSED|ARCHIVED; all=no group.",
            schema: {
              type: "string",
              enum: ["active", "closed", "all"],
            },
          },
          {
            in: "query",
            name: "kpiRiskClass",
            schema: { type: "string", enum: ["MAJOR", "MINOR"] },
          },
          {
            in: "query",
            name: "generalLevel",
            schema: {
              type: "string",
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            },
          },
          {
            in: "query",
            name: "q",
            description:
              "Case-insensitive search across risk title, risk code, KPI code and KPI name (max 100 after trim).",
            schema: { type: "string", maxLength: 100 },
          },
        ],
        responses: {
          "200": {
            description:
              "Tenant-filtered risk page. Each item uses the risk detail DTO, including additive source.actual value fields when linked.",
          },
          "403": { description: "Missing risk:read permission" },
        },
      },
    },
    "/risks/{id}": {
      get: {
        summary: "Get a Company risk",
        description:
          "Returns the risk detail DTO for the active Company. " +
          "source.actual includes additive actualValue, variance and targetValueSnapshot strings when a KPI actual is linked.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Risk in the active Company context" },
          "403": { description: "Missing risk:read permission" },
          "404": { description: "Risk not in the active Company context" },
        },
      },
    },
  },
} as const;
