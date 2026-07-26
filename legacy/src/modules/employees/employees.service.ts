import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { assertTenantReference, findTenantOr404 } from '../../utils/tenant';

export function list(
  clientId: string,
  opts: { skip?: number; take?: number; department_id?: string; status?: string } = {},
) {
  return prisma.employee.findMany({
    where: {
      client_id: clientId,
      ...(opts.department_id ? { department_id: opts.department_id } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { employee_code: 'asc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function get(clientId: string, id: string) {
  return findTenantOr404<Record<string, unknown>>(prisma.employee, id, clientId, 'Employee');
}

async function validateRefs(clientId: string, data: Record<string, unknown>) {
  await assertTenantReference(prisma.department, data.department_id as string | undefined, clientId, 'Department');
  await assertTenantReference(prisma.employee, data.manager_id as string | undefined, clientId, 'Manager');
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  await validateRefs(clientId, data);
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: { client_id: clientId, ...data } as Prisma.EmployeeUncheckedCreateInput,
    });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'employee',
      action: 'create',
      recordId: employee.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return employee;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await findTenantOr404(prisma.employee, id, clientId, 'Employee');
  await validateRefs(clientId, data);
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'employee',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return employee;
  });
}

// exit_reason is sensitive HR data. Non-HR readers get it masked to null.
export function maskSensitive<T extends { exit_reason?: unknown }>(
  employee: T,
  includeSensitive: boolean,
): T {
  if (includeSensitive) {
    return employee;
  }
  return { ...employee, exit_reason: null };
}
