import { prisma } from '../config/db';
import { conflict } from './errors';
import { isActiveFrameworkCode } from './framework-scope';

// Ensures a framework exists and is one of the current active frameworks. Removed
// frameworks (GDPR, SOC, ADA, WCAG, ...) are rejected, so controls/checkpoints/
// KPI mappings can never be created or activated under an out-of-scope framework.
export async function requireActiveFramework(frameworkId: string) {
  const framework = await prisma.framework.findUnique({ where: { id: frameworkId } });
  if (
    !framework ||
    !isActiveFrameworkCode(framework.code) ||
    framework.status !== 'active' ||
    !framework.is_active
  ) {
    throw conflict('Framework is not in the current active scope');
  }
  return framework;
}
