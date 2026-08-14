// The only frameworks that are active in the current scope. Everything else
// (GDPR, SOC, ADA, WCAG, ...) must never appear in active dashboard counts or
// active KPI mappings. Removed frameworks may exist only as inactive history.

export interface FrameworkSeed {
  code: string;
  name: string;
  version: string;
}

export const ACTIVE_FRAMEWORKS: FrameworkSeed[] = [
  { code: 'ISO_9001', name: 'ISO 9001', version: '2015' },
  { code: 'ISO_27001', name: 'ISO 27001', version: '2022' },
  { code: 'ISO_14001', name: 'ISO 14001', version: '2015' },
  { code: 'ISO_45001', name: 'ISO 45001', version: '2018' },
  { code: 'ISO_22301', name: 'ISO 22301', version: '2019' },
  { code: 'SA_8000', name: 'SA 8000', version: '2014' },
  { code: 'HIPAA_OMNIBUS', name: 'HIPAA Omnibus', version: 'Current' },
  { code: 'CMMI_SVC_L3', name: 'CMMI Services Level 3', version: 'L3' },
  { code: 'DPDPA', name: 'Digital Personal Data Protection Act', version: '2023/2025' },
];

export const REMOVED_FRAMEWORKS: FrameworkSeed[] = [
  { code: 'GDPR', name: 'GDPR', version: 'legacy' },
  { code: 'SOC_1', name: 'SOC 1', version: 'legacy' },
  { code: 'SOC_2', name: 'SOC 2', version: 'legacy' },
  { code: 'SOC', name: 'SOC', version: 'legacy' },
  { code: 'A11Y', name: 'Accessibility', version: 'legacy' },
  { code: 'ADA', name: 'ADA', version: 'legacy' },
  { code: 'WCAG', name: 'WCAG 2.1 AA', version: 'legacy' },
];

export const ACTIVE_FRAMEWORK_CODES = new Set(ACTIVE_FRAMEWORKS.map((f) => f.code));
export const REMOVED_FRAMEWORK_CODES = new Set(REMOVED_FRAMEWORKS.map((f) => f.code));

export function isActiveFrameworkCode(code: string | undefined | null): boolean {
  return code != null && ACTIVE_FRAMEWORK_CODES.has(code);
}
