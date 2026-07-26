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
    },
    "/organisation/locations": {
      get: {
        summary: "List locations",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Location page" } },
      },
    },
    "/organisation/units": {
      get: {
        summary: "List organisation units",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Unit page" } },
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
        summary: "List Company KPI goals",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Goal page" } },
      },
    },
  },
} as const;
