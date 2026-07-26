import { describe, expect, it, beforeAll, afterAll } from 'vitest';

const dbDescribe = process.env.DATABASE_URL_TEST ? describe : describe.skip;

dbDescribe('PostgreSQL tenant and proof workflows', () => {
  let db: any;
  let clientA: any;
  let clientB: any;
  let userA: any;
  let actor: any;
  let kpi: any;
  let actual: any;
  let policyRegister: any;
  let capa: any;
  let services: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!;
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient();
    const suffix = Date.now().toString(36);
    clientA = await db.client.create({ data: { name: `Test A ${suffix}`, slug: `test-a-${suffix}` } });
    clientB = await db.client.create({ data: { name: `Test B ${suffix}`, slug: `test-b-${suffix}` } });
    const { hashPassword } = await import('../src/utils/password');
    userA = await db.user.create({ data: { client_id: clientA.id, email: `admin-${suffix}@example.test`, full_name: 'Test Admin', password_hash: await hashPassword('Strong-Test-Password!'), is_superuser: true } });
    actor = { user: { ...userA, permissions: [], is_platform_admin: false, is_hr: false }, ip: '127.0.0.1', userAgent: 'vitest' };
    services = {
      auth: await import('../src/modules/auth/auth.service'),
      kpis: await import('../src/modules/kpis/kpis.service'),
      targets: await import('../src/modules/kpi-targets/kpi-targets.service'),
      actuals: await import('../src/modules/kpi-actuals/kpi-actuals.service'),
      evidence: await import('../src/modules/evidence/evidence.service'),
      policies: await import('../src/modules/policy-register/policy-register.service'),
      capa: await import('../src/modules/capa/capa.service'),
      mappings: await import('../src/modules/kpi-mapping/kpi-mapping.service'),
      dashboard: await import('../src/modules/dashboard/dashboard.service'),
    };
  });

  afterAll(async () => {
    if (db && clientA) await db.client.delete({ where: { id: clientA.id } });
    if (db && clientB) await db.client.delete({ where: { id: clientB.id } });
    if (db) await db.$disconnect();
    if (services) await (await import('../src/config/db')).prisma.$disconnect();
  });

  it('logs in with tenant slug and writes the login audit', async () => {
    const result = await services.auth.login({ client_slug: clientA.slug, email: userA.email, password: 'Strong-Test-Password!' }, {});
    expect(result.access_token).toBeTypeOf('string');
    expect(await db.auditTrail.count({ where: { client_id: clientA.id, action: 'login' } })).toBe(1);
  });

  it('creates a KPI and audit row but hides it from another tenant', async () => {
    kpi = await services.kpis.create(actor, { kpi_code: 'TEST-KPI', kpi_name: 'Integration KPI', direction: 'higher_is_better', frequency: 'monthly', use_in_scope: true, status: 'active' });
    expect(await db.auditTrail.count({ where: { client_id: clientA.id, module: 'kpi', record_id: kpi.id } })).toBe(1);
    await expect(services.kpis.get(clientB.id, kpi.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates KPI targets and actuals, then blocks approval without proof', async () => {
    const target = await services.targets.create(actor, { kpi_id: kpi.id, target_value: 90, enabled: true });
    actual = await services.actuals.create(actor, { kpi_id: kpi.id, kpi_target_id: target.id, period: '2099-01', target_value: 90, actual_value: 95, evidence_required: true });
    await expect(services.actuals.approve(actor, actual.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('uploads, approves and links evidence, allowing KPI approval', async () => {
    const file = { filename: 'test.pdf', originalname: 'proof.pdf', path: '/tmp/proof.pdf', size: 5, mimetype: 'application/pdf', buffer: Buffer.from('proof') } as any;
    const evidence = await services.evidence.upload(actor, { evidence_code: `EVD-${Date.now()}`, title: 'Approved proof' }, file);
    await services.evidence.approve(actor, evidence.id);
    await services.evidence.link(actor, evidence.id, { linked_entity_type: 'kpi_actual', linked_entity_id: actual.id });
    expect((await services.actuals.approve(actor, actual.id)).approval_status).toBe('approved');
  });

  it('creates a classified risk register entry from a missed KPI target', async () => {
    const failedActual = await services.actuals.create(actor, { kpi_id: kpi.id, period: '2099-02', target_value: 90, actual_value: 70, evidence_required: true });
    const risk = await services.actuals.createRiskFromActual(actor, failedActual.id, { risk_code: `RSK-${Date.now()}`, classification: 'major' });
    expect(risk.classification).toBe('major');
    expect(risk.kpi_id).toBe(kpi.id);
    expect(risk.kpi_actual_id).toBe(failedActual.id);
  });

  it('blocks policy approval and CAPA closure without approved evidence', async () => {
    const policy = await db.policy.create({ data: { client_id: clientA.id, policy_code: 'T-POL', title: 'Test policy' } });
    policyRegister = await services.policies.create(actor, { policy_id: policy.id, policy_code: 'T-POL', policy_name: 'Test policy', version: '1.0' });
    await expect(services.policies.approve(actor, policyRegister.id)).rejects.toMatchObject({ statusCode: 409 });
    const gap = await db.gap.create({ data: { client_id: clientA.id, gap_code: 'T-GAP', title: 'Test gap' } });
    capa = await services.capa.create(actor, { capa_code: 'T-CAPA', gap_id: gap.id, title: 'Test CAPA', closure_evidence_required: true });
    await expect(services.capa.close(actor, capa.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('blocks removed framework mappings', async () => {
    const removed = await db.framework.upsert({ where: { code_version: { code: 'GDPR', version: 'legacy' } }, update: { is_active: false, status: 'not_in_current_scope' }, create: { code: 'GDPR', name: 'GDPR', version: 'legacy', is_active: false, status: 'not_in_current_scope' } });
    await expect(services.mappings.create(actor, { kpi_id: kpi.id, framework_id: removed.id })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns dashboard counts scoped to one client', async () => {
    await db.kpi.create({ data: { client_id: clientB.id, kpi_code: 'OTHER-KPI', kpi_name: 'Other tenant KPI' } });
    const summary = await services.dashboard.summary(clientA.id);
    expect(summary.total_kpis).toBe(1);
    expect(summary.active_kpis).toBe(1);
  });
});
