export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'GenBioCa GRC and KPI API', version: '1.0.0', description: 'Tenant-safe PostgreSQL/Prisma API. Protected endpoints use a JWT bearer token.' },
  servers: [{ url: '/' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/health': { get: { summary: 'Service and database health', responses: { '200': { description: 'Healthy' }, '503': { description: 'Database unavailable' } } } },
    '/api/v1/auth/login': { post: { summary: 'Login using tenant slug, email and password', responses: { '200': { description: 'JWT access token' }, '401': { description: 'Invalid credentials' } } } },
    '/api/v1/auth/me': { get: { summary: 'Current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Current user and permissions' } } } },
    '/api/v1/dashboard/summary': { get: { summary: 'Tenant-scoped dashboard counts', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Dashboard summary' } } } },
    '/api/v1/kpis': { get: { summary: 'List tenant KPIs', security: [{ bearerAuth: [] }], responses: { '200': { description: 'KPI list' } } }, post: { summary: 'Create KPI', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } } },
    '/api/v1/kpi-mapping/sequence': { get: { summary: 'Company-agreed KPI mapping display order', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Policy, Framework, Rule, Evidence, Control, KPI, Risk' } } } },
    '/api/v1/kpi-actuals/{id}/create-risk': { post: { summary: 'Create a major/minor risk from a missed KPI target', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Risk register entry created' }, '409': { description: 'Target achieved or an open risk already exists' } } } },
    '/api/v1/evidence/upload': { post: { summary: 'Upload multipart evidence file', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Uploaded' } } } },
  },
};
