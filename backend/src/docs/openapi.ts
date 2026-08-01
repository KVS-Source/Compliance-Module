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
    "/dashboard/summary": {
      get: {
        summary: "Get Company-scoped operational dashboard aggregates",
        description:
          "Returns KPI, risk, organisation and framework sections allowed by the authenticated user's read permissions. Restricted sections are null.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Permission-aware dashboard summary" },
          "401": { description: "Missing or invalid Company context" },
        },
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
            description:
              "KPI actual is not awaiting an approval decision, or Evidence is required and not satisfied (EVIDENCE_REQUIRED with EVIDENCE_KPI_LINK_REQUIRED or EVIDENCE_KPI_COVERAGE_INCOMPLETE)",
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
    "/risks/{id}/reviews": {
      post: {
        summary: "Record an append-only risk review",
        description:
          "Records reviewer, comments and optionally a revised likelihood and impact. " +
          "The service computes residualScore and re-derives generalLevel. " +
          "Rows are immutable: the risk_reviews_append_only trigger rejects UPDATE and DELETE.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Review recorded" },
          "400": { description: "Revised likelihood and impact must be given together" },
          "403": { description: "Missing risk:treat permission" },
          "404": { description: "Risk not in the active Company context" },
          "409": { description: "Risk is closed or archived" },
        },
      },
    },
    "/risks/{id}/treatments": {
      post: {
        summary: "Record an append-only risk treatment",
        description:
          "Strategy, plan, owner and due date. Rows are immutable: the " +
          "risk_treatments_append_only trigger rejects UPDATE and DELETE.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Treatment recorded" },
          "400": { description: "Owner is not an active user in the Company" },
          "403": { description: "Missing risk:treat permission" },
          "404": { description: "Risk not in the active Company context" },
          "409": { description: "Risk is closed or archived" },
        },
      },
    },
    "/risks/{id}/treatments/{treatmentId}/complete": {
      post: {
        summary: "Complete a treatment by appending a superseding entry",
        description:
          "Completion never edits the original row. It inserts a new COMPLETED " +
          "treatment whose supersedesId points at the original, so the current " +
          "treatment is the latest row.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Completion entry appended" },
          "403": { description: "Missing risk:treat permission" },
          "404": { description: "Risk or treatment not in the active Company context" },
          "409": { description: "Treatment already completed, cancelled or superseded" },
        },
      },
    },
    "/risks/{id}/owner": {
      patch: {
        summary: "Assign or clear the risk owner",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Owner updated" },
          "400": { description: "Owner is not an active user in the Company" },
          "403": { description: "Missing risk:treat permission" },
          "404": { description: "Risk not in the active Company context" },
        },
      },
    },
    "/risks/{id}/close": {
      post: {
        summary: "Close a risk with a recorded reason",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Risk closed and RISK_CLOSED audit written" },
          "400": { description: "A closure reason is required" },
          "403": { description: "Missing risk:close permission" },
          "404": { description: "Risk not in the active Company context" },
          "409": { description: "Risk is already closed or archived" },
        },
      },
    },
    "/risks/{id}/reopen": {
      post: {
        summary: "Reopen a closed risk",
        description:
          "Returns the risk to UNDER_REVIEW and clears the closure fields. " +
          "Refused with RISK_ACTIVE_DUPLICATE_FOR_ACTUAL when another live risk " +
          "already exists for the same KPI actual, which risks_one_active_per_kpi_actual forbids.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Risk reopened and RISK_REOPENED audit written" },
          "403": { description: "Missing risk:close permission" },
          "404": { description: "Risk not in the active Company context" },
          "409": {
            description:
              "Risk is not closed, or another live risk exists for the same KPI actual",
          },
        },
      },
    },
    "/policies": {
      get: {
        summary: "List Policies",
        description:
          "versionStatus and frameworkId filter latestVersion at SQL level with " +
          "accurate pagination totals; review-due filters require currentApprovedVersion. " +
          "List Version summaries omit content, purpose, scope, and changeSummary.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated Policy list" },
          "403": { description: "Missing policies:read" },
        },
      },
      post: {
        summary: "Create Policy with Version 1.0 DRAFT",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Policy created" },
          "400": { description: "Validation or related-record failure" },
          "403": { description: "Missing policies:write" },
        },
      },
    },
    "/policies/{policyId}": {
      get: {
        summary: "Get Policy detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Policy detail with latestVersion and currentApprovedVersion" },
          "404": { description: "Policy not found in active Company" },
        },
      },
      patch: {
        summary: "Update Policy register fields",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Policy updated" },
          "409": { description: "Policy archived" },
        },
      },
    },
    "/policies/{policyId}/archive": {
      post: {
        summary: "Archive Policy",
        description:
          "Refused while any Version is SUBMITTED. Historical Versions remain unchanged.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Policy archived" },
          "409": { description: "Already archived or SUBMITTED Version present" },
        },
      },
    },
    "/policies/{policyId}/versions": {
      get: {
        summary: "List Policy Versions",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Version history" } },
      },
      post: {
        summary: "Create DRAFT Policy Version",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Version created with server-allocated MAJOR/MINOR" },
          "409": { description: "Policy archived" },
        },
      },
    },
    "/policies/{policyId}/versions/{versionId}": {
      get: {
        summary: "Get Policy Version",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Version detail" },
          "404": { description: "Version not found" },
        },
      },
    },
    "/policies/{policyId}/traceability": {
      get: {
        summary: "Policy Framework and Control mapping traceability",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Bounded read-only traceability" } },
      },
    },
    "/policies/{policyId}/audit-events": {
      get: {
        summary: "Policy-scoped audit events",
        description:
          "Filters by POLICY and POLICY_VERSION entity types for the Policy and its Versions.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated safe audit events" } },
      },
    },
    "/policy-versions/{versionId}": {
      patch: {
        summary: "Update DRAFT or REJECTED Policy Version",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Version updated" },
          "409": { description: "Immutable or archived" },
        },
      },
    },
    "/policy-versions/{versionId}/frameworks": {
      put: {
        summary: "Replace active Framework mappings",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Mappings updated without hard deletes" },
          "409": { description: "Version not editable" },
        },
      },
    },
    "/policy-versions/{versionId}/submit": {
      post: {
        summary: "Submit or resubmit Policy Version",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Version submitted" },
          "409": { description: "Invalid state or archived Policy" },
        },
      },
    },
    "/policy-versions/{versionId}/approve": {
      post: {
        summary: "Approve submitted Policy Version",
        description:
          "When requiresEvidence is true, requires independent Control- and " +
          "Checkpoint-linked qualifying APPROVED Evidence for the exact " +
          "submitted Policy Version (active ControlPolicyVersion mappings). " +
          "Empty required-target configuration → 409 EVIDENCE_REQUIRED " +
          "(EVIDENCE_GATE_NOT_CONFIGURED). Incomplete coverage → 409 with " +
          "EVIDENCE_CONTROL_COVERAGE_INCOMPLETE, " +
          "EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE, or EVIDENCE_COVERAGE_INCOMPLETE. " +
          "Rejects future-effective dates and self-approval.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Approved with atomic supersession" },
          "403": { description: "Self-approval or requested-approver mismatch" },
          "409": {
            description:
              "EVIDENCE_REQUIRED (coverage incomplete or not configured), " +
              "invalid state, or archived Policy",
          },
        },
      },
    },
    "/policy-versions/{versionId}/reject": {
      post: {
        summary: "Reject submitted Policy Version",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Rejected with mandatory comments on PolicyApproval only" },
          "403": { description: "Self-decision or requested-approver mismatch" },
        },
      },
    },
    "/controls": {
      get: {
        summary: "List Controls",
        description:
          "Supports filters for lifecycle, implementation, owner, department, " +
          "controlType, frequency, requiresEvidence, review-due dates, and active " +
          "Policy/Framework/Rule mappings. List rows omit large text fields and " +
          "include small active mapping and Checkpoint counts.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated Control list" },
          "403": { description: "Missing controls:read" },
        },
      },
      post: {
        summary: "Create Control",
        description:
          "Server allocates CTL-### codes. Optional initial Policy Version, " +
          "Framework and Framework Rule mappings must satisfy APPROVED-only and " +
          "Framework/Rule dependency rules. lifecycleStatus is server-controlled.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Control created" },
          "400": { description: "Validation, mapping or related-record failure" },
          "403": { description: "Missing controls:write" },
        },
      },
    },
    "/controls/{controlId}": {
      get: {
        summary: "Get Control detail",
        description:
          "Returns scalar fields plus active mapping and Checkpoint counts. " +
          "Archived Controls remain readable.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Control detail with counts" },
          "404": { description: "Control not found in active Company" },
        },
      },
      patch: {
        summary: "Update Control register fields",
        description:
          "Does not accept lifecycle or mapping fields. Archived Controls are immutable.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Control updated" },
          "409": { description: "Control archived" },
        },
      },
    },
    "/controls/{controlId}/activate": {
      post: {
        summary: "Activate Control",
        description: "INACTIVE → ACTIVE only. Same-state and archived calls return 409.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Control activated" },
          "409": { description: "CONTROL_INVALID_STATE" },
        },
      },
    },
    "/controls/{controlId}/deactivate": {
      post: {
        summary: "Deactivate Control",
        description:
          "ACTIVE → INACTIVE only. Active Checkpoints may remain (accepted limitation).",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Control deactivated" },
          "409": { description: "CONTROL_INVALID_STATE" },
        },
      },
    },
    "/controls/{controlId}/archive": {
      post: {
        summary: "Archive Control",
        description:
          "Refused with 409 CONTROL_HAS_ACTIVE_CHECKPOINTS while any Checkpoint is ACTIVE. " +
          "Does not alter Checkpoint or mapping rows.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Control archived" },
          "409": {
            description:
              "CONTROL_INVALID_STATE or CONTROL_HAS_ACTIVE_CHECKPOINTS",
          },
        },
      },
    },
    "/controls/{controlId}/policy-versions": {
      put: {
        summary: "Replace active Policy Version mappings",
        description:
          "Body: { policyVersionIds }. Only currently APPROVED Versions. " +
          "One active mapping per stable Policy. Soft-replace; identical PUT is a no-op.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Mappings updated" },
          "400": { description: "CONTROL_MAPPING_INVALID or RELATED_RECORD_INVALID" },
          "409": { description: "Archived Control" },
        },
      },
    },
    "/controls/{controlId}/frameworks": {
      put: {
        summary: "Replace active Framework mappings",
        description:
          "Body: { frameworkIds }. Rejects removals that still have active RuleControl rows.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Mappings updated" },
          "409": {
            description:
              "Archived Control or Framework still has active Rule mappings",
          },
        },
      },
    },
    "/controls/{controlId}/framework-rules": {
      put: {
        summary: "Replace active Framework Rule mappings",
        description:
          "Body: { frameworkRuleIds }. Requires an existing active ControlFramework " +
          "for each Rule's Framework; does not auto-create Framework mappings.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Mappings updated" },
          "400": { description: "CONTROL_MAPPING_INVALID when Framework mapping missing" },
        },
      },
    },
    "/controls/{controlId}/traceability": {
      get: {
        summary: "Control mapping traceability",
        description:
          "Active and inactive Policy Version, Framework and Rule mappings with Version status.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Bounded read-only traceability" } },
      },
    },
    "/controls/{controlId}/audit-events": {
      get: {
        summary: "Control-scoped audit events",
        description: "Filters by entityType CONTROL and entityId controlId.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated safe audit events" } },
      },
    },
    "/checkpoints": {
      get: {
        summary: "List Checkpoints",
        description:
          "Default includes ACTIVE, INACTIVE and ARCHIVED. Filters: q, code, title, " +
          "lifecycleStatus, controlId, controlLifecycleStatus, ownerId, departmentId, " +
          "verificationFrequency, latestOutcome, hasReviews, evidenceRequired, " +
          "dueFrom/dueTo (nextReviewDate), reviewPeriod, frameworkId, policyId. " +
          "List rows omit description, expectedResult, observation and recommendation.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated Checkpoint list" },
          "403": { description: "Missing checkpoints:read" },
        },
      },
      post: {
        summary: "Create Checkpoint",
        description:
          "Server allocates CHK-### codes and sets lifecycle ACTIVE. Parent Control " +
          "must not be ARCHIVED; INACTIVE parents are allowed. Body fields: controlId, " +
          "title, expectedResult, verificationFrequency; optional description, ownerId, " +
          "departmentId, evidenceRequired, initialReviewDate.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Checkpoint created" },
          "400": { description: "Validation or related-record failure" },
          "403": { description: "Missing checkpoints:write" },
          "409": { description: "CHECKPOINT_PARENT_CONTROL_ARCHIVED" },
        },
      },
    },
    "/checkpoints/{checkpointId}": {
      get: {
        summary: "Get Checkpoint detail",
        description:
          "Scalar summary, parent Control, latestReview summary, totalReviewCount and " +
          "active mapping counts. Archived Checkpoints remain readable.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Checkpoint detail" },
          "404": { description: "Checkpoint not found in active Company" },
        },
      },
      patch: {
        summary: "Update Checkpoint register fields",
        description:
          "Does not accept controlId, code, lifecycle or latest-review fields. " +
          "verificationFrequency and initialReviewDate freeze after the first Review " +
          "(409 CHECKPOINT_INVALID_STATE). Archived Checkpoints are immutable.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Checkpoint updated" },
          "409": { description: "CHECKPOINT_INVALID_STATE" },
        },
      },
    },
    "/checkpoints/{checkpointId}/activate": {
      post: {
        summary: "Activate Checkpoint",
        description:
          "INACTIVE → ACTIVE. Empty body {}. Rejects ARCHIVED parent Control. " +
          "Same-state and archived Checkpoint return 409.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Checkpoint activated" },
          "409": {
            description:
              "CHECKPOINT_INVALID_STATE or CHECKPOINT_PARENT_CONTROL_ARCHIVED",
          },
        },
      },
    },
    "/checkpoints/{checkpointId}/deactivate": {
      post: {
        summary: "Deactivate Checkpoint",
        description: "ACTIVE → INACTIVE. Empty body {}. Does not alter parent Control.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Checkpoint deactivated" },
          "409": { description: "CHECKPOINT_INVALID_STATE" },
        },
      },
    },
    "/checkpoints/{checkpointId}/archive": {
      post: {
        summary: "Archive Checkpoint",
        description:
          "ACTIVE/INACTIVE → ARCHIVED. Empty body {}. Preserves Reviews and Control linkage.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Checkpoint archived" },
          "409": { description: "CHECKPOINT_INVALID_STATE" },
        },
      },
    },
    "/checkpoints/{checkpointId}/reviews": {
      get: {
        summary: "List Checkpoint Reviews",
        description:
          "Append-only history ordered by submittedAt then id. Includes observation " +
          "and recommendation for checkpoints:read.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated Review history" } },
      },
      post: {
        summary: "Create Checkpoint Review",
        description:
          "Requires ACTIVE Checkpoint and non-ARCHIVED parent Control. Reviewer is the " +
          "authenticated actor. reviewPeriod must match verificationFrequency " +
          "(DAILY YYYY-MM-DD; WEEKLY YYYY-Www; MONTHLY YYYY-MM; QUARTERLY YYYY-Qn; " +
          "HALF_YEARLY YYYY-Hn; ANNUAL YYYY; CONTINUOUS/PER_EVENT YYYY-MM-DD#TOKEN; " +
          "ONE_TIME ONE-TIME). Duplicate period → 409 CHECKPOINT_REVIEW_DUPLICATE. " +
          "Latest review is synced by the database trigger. " +
          "When evidenceRequired is true, requires qualifying APPROVED Evidence " +
          "actively linked to this Checkpoint (file-backed, not expired, not " +
          "superseded by APPROVED/ARCHIVED successor); otherwise 409 EVIDENCE_REQUIRED.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Review created" },
          "400": { description: "CHECKPOINT_REVIEW_INVALID" },
          "403": { description: "Missing checkpoints:review" },
          "409": {
            description:
              "CHECKPOINT_INVALID_STATE, CHECKPOINT_PARENT_CONTROL_ARCHIVED, " +
              "CHECKPOINT_REVIEW_DUPLICATE, CHECKPOINT_REVIEW_CONFLICT, " +
              "or EVIDENCE_REQUIRED when evidenceRequired and coverage incomplete",
          },
        },
      },
    },
    "/checkpoints/{checkpointId}/latest-review": {
      get: {
        summary: "Get latest Checkpoint Review",
        description:
          "Returns the database-authoritative latest Review (submitted_at, then UUID " +
          "text tie-break) or null when none exist.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Latest Review or null" },
          "404": { description: "Checkpoint not found" },
        },
      },
    },
    "/checkpoints/{checkpointId}/traceability": {
      get: {
        summary: "Checkpoint Control mapping traceability",
        description:
          "Parent Control plus active/historical Policy Version, Framework and Rule " +
          "mappings, latest Review summary and total Review count.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Bounded read-only traceability" } },
      },
    },
    "/checkpoints/{checkpointId}/audit-events": {
      get: {
        summary: "Checkpoint-scoped audit events",
        description:
          "Filters by entityType CHECKPOINT and entityId checkpointId. Safe metadata only.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated safe audit events" } },
      },
    },
    "/evidence": {
      get: {
        summary: "List Evidence",
        description:
          "Paginated tenant-scoped Evidence metadata. Filters: q, lifecycleStatus, " +
          "ownerId, departmentId, expiresBefore, expiresAfter.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated Evidence list" } },
      },
      post: {
        summary: "Create DRAFT Evidence metadata",
        description:
          "Server allocates EVD-###. Optional supersedesEvidenceId for replacement " +
          "of REJECTED or ARCHIVED Evidence.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Created DRAFT Evidence" },
          "400": { description: "Validation or related-record error" },
          "409": { description: "Invalid supersede target" },
        },
      },
    },
    "/evidence/review-queue": {
      get: {
        summary: "List Evidence awaiting review",
        description:
          "Requires evidence:review. Returns only SUBMITTED Evidence, FIFO by " +
          "submittedAt then id. Optional q and expires filters. No storageKey.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated review queue" },
          "403": { description: "Missing evidence:review" },
        },
      },
    },
    "/evidence/{evidenceId}": {
      get: {
        summary: "Get Evidence detail",
        description:
          "Includes active link counts, reviewedBy, reviewedAt, and " +
          "latestReviewDecision. Does not embed full link arrays or storageKey.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Evidence detail (no storageKey)" },
          "404": { description: "Evidence not found" },
        },
      },
      patch: {
        summary: "Update eligible Evidence metadata",
        description: "Allowed only for DRAFT or REJECTED. No lifecycle mutation.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Updated Evidence" },
          "409": { description: "Invalid state or archived" },
        },
      },
    },
    "/evidence/{evidenceId}/controls": {
      get: {
        summary: "List active Control links for Evidence",
        description:
          "Paginated active EvidenceControlLink rows. Requires evidence:read. " +
          "Readable for every Evidence lifecycle; mutations require DRAFT.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated active Control link summaries" },
          "404": { description: "Evidence not found" },
        },
      },
    },
    "/evidence/{evidenceId}/controls/{controlId}": {
      post: {
        summary: "Link Evidence to a Control",
        description:
          "DRAFT Evidence only; Control must be ACTIVE. Empty body {}. " +
          "201 on first link, 200 on re-link of inactive pair, " +
          "409 EVIDENCE_CONTROL_LINK_EXISTS when already active. " +
          "Does not submit, approve, or satisfy Evidence gates.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Created active Control link" },
          "200": { description: "Reactivated Control link" },
          "404": { description: "Evidence or Control not found" },
          "409": {
            description:
              "Invalid Evidence state, Control not ACTIVE, or link already active",
          },
        },
      },
    },
    "/evidence/{evidenceId}/controls/{controlId}/unlink": {
      post: {
        summary: "Unlink Evidence from a Control (soft)",
        description:
          "DRAFT Evidence only. Sets isActive=false; preserves the row. " +
          "Target may be INACTIVE or ARCHIVED. Empty body {}.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Link deactivated" },
          "404": {
            description: "Evidence, Control, or active link not found",
          },
          "409": { description: "Evidence not DRAFT" },
        },
      },
    },
    "/evidence/{evidenceId}/checkpoints": {
      get: {
        summary: "List active Checkpoint links for Evidence",
        description:
          "Paginated active EvidenceCheckpointLink rows. Independent of Control links. " +
          "Requires evidence:read.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated active Checkpoint link summaries" },
          "404": { description: "Evidence not found" },
        },
      },
    },
    "/evidence/{evidenceId}/checkpoints/{checkpointId}": {
      post: {
        summary: "Link Evidence to a Checkpoint",
        description:
          "DRAFT Evidence only; Checkpoint must be ACTIVE. Empty body {}. " +
          "Does not require an Evidence-Control link. " +
          "201 create / 200 re-link / 409 when already active.",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Created active Checkpoint link" },
          "200": { description: "Reactivated Checkpoint link" },
          "404": { description: "Evidence or Checkpoint not found" },
          "409": {
            description:
              "Invalid Evidence state, Checkpoint not ACTIVE, or link already active",
          },
        },
      },
    },
    "/evidence/{evidenceId}/checkpoints/{checkpointId}/unlink": {
      post: {
        summary: "Unlink Evidence from a Checkpoint (soft)",
        description:
          "DRAFT Evidence only. Soft isActive=false. Empty body {}.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Link deactivated" },
          "404": {
            description: "Evidence, Checkpoint, or active link not found",
          },
          "409": { description: "Evidence not DRAFT" },
        },
      },
    },
    "/evidence/{evidenceId}/file": {
      post: {
        summary: "Upload Evidence file (multipart field file)",
        description:
          "DRAFT only, one file, max 10 MiB, allowlisted types. Server computes " +
          "SHA-256 and storage key. Tenant-scoped hash uniqueness.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Evidence with hasFile true" },
          "400": { description: "Type/signature/validation error" },
          "409": { description: "Already exists or duplicate hash" },
          "413": { description: "File too large" },
        },
      },
      get: {
        summary: "Download Evidence file as attachment",
        description:
          "Requires evidence:read and evidence:download. Streams attachment; " +
          "never returns storageKey.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "File stream" },
          "403": { description: "Missing permission" },
          "404": { description: "Not found or file unavailable" },
        },
      },
    },
    "/evidence/{evidenceId}/submit": {
      post: {
        summary: "Submit Evidence for review",
        description:
          "Requires a stored file (hasFile). Returns 409 EVIDENCE_FILE_REQUIRED " +
          "when no file is present.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "SUBMITTED Evidence" },
          "409": { description: "EVIDENCE_FILE_REQUIRED or invalid state" },
        },
      },
    },
    "/evidence/{evidenceId}/archive": {
      post: {
        summary: "Archive Evidence",
        description:
          "Allowed from DRAFT, REJECTED or APPROVED. Archived Evidence remains readable.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Archived Evidence" },
          "409": { description: "Invalid state" },
        },
      },
    },
    "/evidence/{evidenceId}/approve": {
      post: {
        summary: "Approve submitted Evidence",
        description:
          "Requires evidence:review. Only SUBMITTED Evidence. Optional comment " +
          "(2–2000). Blocks creator, uploader and submitter self-review including " +
          "COMPANY_ADMIN. Append-only decision + lifecycle in one transaction. " +
          "Does not satisfy Policy/KPI Evidence gates.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "APPROVED Evidence with review summary" },
          "403": { description: "Missing permission or self-review" },
          "404": { description: "Evidence not found" },
          "409": { description: "Invalid state or file required" },
        },
      },
    },
    "/evidence/{evidenceId}/reject": {
      post: {
        summary: "Reject submitted Evidence",
        description:
          "Requires evidence:review. Only SUBMITTED Evidence. Mandatory reason " +
          "(2–2000). Same maker-checker rules as approve. Correction uses a new " +
          "superseding DRAFT Evidence record.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "REJECTED Evidence with review summary" },
          "400": { description: "Missing or invalid reason" },
          "403": { description: "Missing permission or self-review" },
          "404": { description: "Evidence not found" },
          "409": { description: "Invalid state" },
        },
      },
    },
    "/evidence/{evidenceId}/review-decisions": {
      get: {
        summary: "List Evidence review decisions",
        description:
          "Requires evidence:read. Append-only history ordered by decidedAt desc. " +
          "Includes decision, reason/comment, and actedBy summary.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated review decisions" },
          "404": { description: "Evidence not found" },
        },
      },
    },
    "/evidence/{evidenceId}/audit-events": {
      get: {
        summary: "Evidence-scoped audit events",
        description:
          "Filters by entityType EVIDENCE and entityId evidenceId. Safe metadata only.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated safe audit events" } },
      },
    },
  },
} as const;
