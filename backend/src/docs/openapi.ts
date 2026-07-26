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
  },
} as const;
