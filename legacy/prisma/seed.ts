import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const activeFrameworks = [
  ['ISO_9001', 'ISO 9001', '2015'], ['ISO_27001', 'ISO 27001', '2022'],
  ['ISO_14001', 'ISO 14001', '2015'], ['ISO_45001', 'ISO 45001', '2018'],
  ['ISO_22301', 'ISO 22301', '2019'], ['SA_8000', 'SA 8000', '2014'],
  ['HIPAA_OMNIBUS', 'HIPAA Omnibus', 'Current'], ['CMMI_SVC_L3', 'CMMI Services Level 3', 'L3'],
  ['DPDPA', 'Digital Personal Data Protection Act', '2023/2025'],
] as const;
const removedFrameworks = [
  ['GDPR', 'GDPR'], ['SOC', 'SOC'], ['SOC_1', 'SOC 1'], ['SOC_2', 'SOC 2'],
  ['A11Y', 'Accessibility'], ['ADA', 'ADA'], ['WCAG', 'WCAG 2.1 AA'],
] as const;
const permissionCodes = [
  'admin.manage', 'dashboard.view', 'kpi.view', 'kpi.edit', 'kpi.approve',
  'evidence.view', 'evidence.edit', 'evidence.approve', 'policy.view', 'policy.edit',
  'policy.approve', 'gap.view', 'gap.edit', 'capa.view', 'capa.edit', 'capa.close', 'audit.view',
];

async function main() {
  const client = await prisma.client.upsert({ where: { slug: 'genbioca' }, update: { status: 'active' }, create: { name: 'GenBioCa', slug: 'genbioca', contact_email: 'admin@genbioca.example' } });

  const permissions = new Map<string, string>();
  for (const code of permissionCodes) {
    const row = await prisma.permission.upsert({ where: { code }, update: { status: 'active' }, create: { code, name: code.split('.').map(x => x[0].toUpperCase() + x.slice(1)).join(' ') } });
    permissions.set(code, row.id);
  }
  const roleSpecs: Record<string, string[]> = {
    Administrator: permissionCodes,
    'Compliance Manager': ['dashboard.view', 'kpi.view', 'kpi.approve', 'evidence.view', 'evidence.edit', 'evidence.approve', 'policy.view', 'policy.edit', 'policy.approve', 'gap.view', 'gap.edit', 'capa.view', 'capa.edit', 'capa.close', 'audit.view'],
    'KPI Owner': ['dashboard.view', 'kpi.view', 'kpi.edit', 'evidence.view', 'evidence.edit'],
    HR: ['dashboard.view', 'evidence.view', 'evidence.edit'],
  };
  const roles = new Map<string, string>();
  for (const [name, codes] of Object.entries(roleSpecs)) {
    const role = await prisma.role.upsert({ where: { client_id_name: { client_id: client.id, name } }, update: { status: 'active' }, create: { client_id: client.id, name } });
    roles.set(name, role.id);
    for (const code of codes) await prisma.rolePermission.upsert({ where: { role_id_permission_id: { role_id: role.id, permission_id: permissions.get(code)! } }, update: { client_id: client.id }, create: { client_id: client.id, role_id: role.id, permission_id: permissions.get(code)! } });
  }

  const userSpecs = [
    ['admin@genbioca.example', 'GenBioCa Admin', process.env.DEMO_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026!', 'Administrator', true, false],
    ['compliance@genbioca.example', 'Compliance Manager', process.env.DEMO_COMPLIANCE_PASSWORD ?? 'ChangeMe-Compliance-2026!', 'Compliance Manager', false, false],
    ['kpi.owner@genbioca.example', 'KPI Owner', process.env.DEMO_KPI_OWNER_PASSWORD ?? 'ChangeMe-KPI-2026!', 'KPI Owner', false, false],
    ['hr@genbioca.example', 'HR Manager', process.env.DEMO_HR_PASSWORD ?? 'ChangeMe-HR-2026!', 'HR', false, true],
  ] as const;
  const users = new Map<string, string>();
  for (const [email, full_name, password, roleName, is_superuser, is_hr] of userSpecs) {
    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({ where: { client_id_email: { client_id: client.id, email } }, update: { full_name, password_hash, is_active: true, is_superuser, is_hr }, create: { client_id: client.id, email, full_name, password_hash, is_superuser, is_hr } });
    users.set(email, user.id);
    await prisma.userRole.upsert({ where: { user_id_role_id: { user_id: user.id, role_id: roles.get(roleName)! } }, update: { client_id: client.id }, create: { client_id: client.id, user_id: user.id, role_id: roles.get(roleName)! } });
  }

  const departments = new Map<string, string>();
  for (const [code, name] of [['COMP', 'Compliance'], ['IT', 'Information Technology'], ['HR', 'Human Resources'], ['OPS', 'Operations']]) {
    const row = await prisma.department.upsert({ where: { client_id_code: { client_id: client.id, code } }, update: { name }, create: { client_id: client.id, code, name } });
    departments.set(code, row.id);
  }

  const frameworkIds = new Map<string, string>();
  for (const [code, name, version] of activeFrameworks) {
    const row = await prisma.framework.upsert({ where: { code_version: { code, version } }, update: { name, status: 'active', is_active: true }, create: { code, name, version, status: 'active', is_active: true } });
    frameworkIds.set(code, row.id);
  }
  for (const [code, name] of removedFrameworks) await prisma.framework.upsert({ where: { code_version: { code, version: 'legacy' } }, update: { status: 'not_in_current_scope', is_active: false }, create: { code, name, version: 'legacy', status: 'not_in_current_scope', is_active: false } });

  const iso = frameworkIds.get('ISO_27001')!;
  const control = await prisma.control.upsert({ where: { framework_id_control_code: { framework_id: iso, control_code: 'A.5.1' } }, update: { title: 'Policies for information security', status: 'active' }, create: { framework_id: iso, control_code: 'A.5.1', title: 'Policies for information security' } });
  await prisma.checkpoint.upsert({ where: { control_id_checkpoint_code: { control_id: control.id, checkpoint_code: 'CP-A5.1-01' } }, update: { status: 'active' }, create: { framework_id: iso, control_id: control.id, checkpoint_code: 'CP-A5.1-01', title: 'Information security policy is approved and reviewed', evidence_required: true } });

  const policy = await prisma.policy.upsert({ where: { client_id_policy_code: { client_id: client.id, policy_code: 'POL-IS-001' } }, update: { status: 'active' }, create: { client_id: client.id, department_id: departments.get('IT'), owner_id: users.get('compliance@genbioca.example'), policy_code: 'POL-IS-001', title: 'Information Security Policy', status: 'active' } });
  const kpi = await prisma.kpi.upsert({ where: { client_id_kpi_code: { client_id: client.id, kpi_code: 'KPI-COMP-001' } }, update: { unit: 'percent', frequency: 'monthly', use_in_scope: true, status: 'active' }, create: { client_id: client.id, kpi_code: 'KPI-COMP-001', kpi_name: 'Policy reviews completed on time', unit: 'percent', direction: 'higher_is_better', frequency: 'monthly', owner_id: users.get('kpi.owner@genbioca.example'), department_id: departments.get('COMP'), use_in_scope: true } });
  let target = await prisma.kpiTarget.findFirst({ where: { client_id: client.id, kpi_id: kpi.id, target_period: '2026' } });
  target ??= await prisma.kpiTarget.create({ data: { client_id: client.id, kpi_id: kpi.id, target_value: 95, target_period: '2026', frequency: 'monthly', owner_id: users.get('kpi.owner@genbioca.example'), department_id: departments.get('COMP'), approval_status: 'approved' } });
  if (target.frequency !== 'monthly') target = await prisma.kpiTarget.update({ where: { id: target.id }, data: { frequency: 'monthly' } });
  const actual = await prisma.kpiActual.upsert({ where: { client_id_kpi_id_period: { client_id: client.id, kpi_id: kpi.id, period: '2026-06' } }, update: { kpi_target_id: target.id, target_value: 95, actual_value: 86, variance: -9, rag_status: 'red' }, create: { client_id: client.id, kpi_id: kpi.id, kpi_target_id: target.id, period: '2026-06', target_value: 95, actual_value: 86, variance: -9, rag_status: 'red', evidence_required: true, submitted_by: users.get('kpi.owner@genbioca.example'), status: 'submitted' } });
  let mapping = await prisma.kpiFrameworkMapping.findFirst({ where: { client_id: client.id, kpi_id: kpi.id, framework_id: iso, control_id: control.id } });
  mapping ??= await prisma.kpiFrameworkMapping.create({ data: { client_id: client.id, kpi_id: kpi.id, framework_id: iso, control_id: control.id, policy_id: policy.id, rule_text: 'Reviewed policies must have approved evidence.', evidence_required: true } });
  const register = await prisma.policyRegister.upsert({ where: { client_id_policy_code_version: { client_id: client.id, policy_code: 'POL-IS-001', version: '1.0' } }, update: {}, create: { client_id: client.id, policy_id: policy.id, policy_code: 'POL-IS-001', policy_name: 'Information Security Policy', department_id: departments.get('IT'), owner_id: users.get('compliance@genbioca.example'), linked_framework_id: iso, linked_control_id: control.id, linked_kpi_id: kpi.id, version: '1.0', next_review_date: new Date('2026-12-31'), status: 'in_review' } });
  const gap = await prisma.gap.upsert({ where: { client_id_gap_code: { client_id: client.id, gap_code: 'GAP-001' } }, update: {}, create: { client_id: client.id, gap_code: 'GAP-001', source_type: 'checkpoint', title: 'Policy review evidence was incomplete', severity: 'high', department_id: departments.get('IT'), owner_id: users.get('compliance@genbioca.example'), due_date: new Date('2026-08-31') } });
  const capa = await prisma.capa.upsert({ where: { client_id_capa_code: { client_id: client.id, capa_code: 'CAPA-001' } }, update: {}, create: { client_id: client.id, capa_code: 'CAPA-001', gap_id: gap.id, title: 'Establish policy review evidence checklist', root_cause: 'No standard evidence checklist', corrective_action: 'Create and approve checklist', owner_id: users.get('compliance@genbioca.example'), due_date: new Date('2026-08-15') } });
  await prisma.risk.upsert({ where: { client_id_risk_code: { client_id: client.id, risk_code: 'RSK-001' } }, update: { kpi_id: kpi.id, kpi_target_id: target.id, kpi_actual_id: actual.id, classification: 'major', probability: 4, impact: 4, risk_score: 16, risk_level: 'major' }, create: { client_id: client.id, kpi_id: kpi.id, kpi_target_id: target.id, kpi_actual_id: actual.id, risk_code: 'RSK-001', risk_title: 'Policy review KPI target not met', risk_description: 'Monthly KPI actual was 86 percent against a 95 percent target.', classification: 'major', department_id: departments.get('IT'), owner_id: users.get('compliance@genbioca.example'), probability: 4, impact: 4, risk_score: 16, risk_level: 'major', mitigation_plan: 'Review overdue policies and monitor the KPI monthly.' } });

  const evidence = await prisma.evidenceDocument.upsert({ where: { client_id_evidence_code: { client_id: client.id, evidence_code: 'EVD-001' } }, update: { approval_status: 'approved' }, create: { client_id: client.id, evidence_code: 'EVD-001', title: 'Approved policy review record', evidence_type: 'policy', file_name: 'seed-policy-review.pdf', original_file_name: 'policy-review.pdf', file_path: 'uploads/seed/seed-policy-review.pdf', file_size: 1024, mime_type: 'application/pdf', uploaded_by: users.get('compliance@genbioca.example'), approval_status: 'approved', reviewer_id: users.get('admin@genbioca.example'), reviewed_at: new Date() } });
  for (const [linked_entity_type, linked_entity_id] of [['kpi_actual', actual.id], ['policy_register', register.id], ['capa', capa.id]] as const) await prisma.evidenceLink.upsert({ where: { client_id_evidence_document_id_linked_entity_type_linked_entity_id: { client_id: client.id, evidence_document_id: evidence.id, linked_entity_type, linked_entity_id } }, update: { status: 'active' }, create: { client_id: client.id, evidence_document_id: evidence.id, linked_entity_type, linked_entity_id, link_reason: 'Seeded approved proof' } });
  for (const [category, code, label, sort_order] of [['frequency', 'monthly', 'Monthly', 1], ['frequency', 'quarterly', 'Quarterly', 2], ['unit', 'percent', 'Percent', 1], ['risk_classification', 'major', 'Major', 1], ['risk_classification', 'minor', 'Minor', 2], ['rag_status', 'green', 'Green', 1], ['rag_status', 'amber', 'Amber', 2], ['rag_status', 'red', 'Red', 3]] as const) await prisma.lookup.upsert({ where: { client_id_category_code: { client_id: client.id, category, code } }, update: { label, sort_order }, create: { client_id: client.id, category, code, label, sort_order } });
  console.log('Seed complete: client slug genbioca; demo users created. See .env.example for passwords.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
