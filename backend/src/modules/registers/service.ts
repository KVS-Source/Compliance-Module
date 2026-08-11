import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { type AuditContext, writeAudit } from "../gaps/repository.js";
import type {
  CreateRegisterRecordBody,
  RegisterRecordListQuery,
  RegisterTypeListQuery,
  UpdateRegisterRecordBody,
} from "./validators.js";

/**
 * One service for every operational register.
 *
 * The workbook's audit schedule, findings, training, incidents, vendors,
 * privacy, meetings and action items differ only in their columns, so they
 * share this code path and are distinguished by their register type's
 * `fieldConfiguration`. Building eight workflow engines for this MVP would
 * have bought nothing this Company needs.
 */

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const recordInclude =
  Prisma.validator<Prisma.OperationalRegisterRecordInclude>()({
    owner: { select: { id: true, code: true, fullName: true } },
    department: { select: { id: true, code: true, name: true } },
    registerType: { select: { id: true, code: true, name: true } },
  });

type RegisterRecord = Prisma.OperationalRegisterRecordGetPayload<{
  include: typeof recordInclude;
}>;

export const registerRecordDto = (
  record: RegisterRecord,
  asOf = new Date(),
) => ({
  id: record.id,
  register: {
    id: record.registerType.id,
    code: record.registerType.code,
    name: record.registerType.name,
  },
  businessRecordCode: record.businessRecordCode,
  title: record.title,
  status: record.status,
  owner: personDto(record.owner),
  sourceOwnerRef: record.sourceOwnerRef,
  department: record.department,
  recordDate: dateOnly(record.recordDate),
  dueDate: dateOnly(record.dueDate),
  // Overdue is computed here, never read from a spreadsheet column.
  overdue:
    record.dueDate !== null &&
    record.dueDate.getTime() < asOf.getTime() &&
    (record.status ?? "").toLowerCase() !== "closed" &&
    (record.status ?? "").toLowerCase() !== "completed" &&
    (record.status ?? "").toLowerCase() !== "cancelled",
  fields: record.payload,
  source: {
    sheet: record.sourceSheet,
    row: record.sourceRow,
    importBatchId: record.importBatchId,
  },
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class RegisterService {
  constructor(private readonly db: PrismaClient) {}

  async listTypes(tenantId: string, query: RegisterTypeListQuery) {
    const where: Prisma.OperationalRegisterTypeWhereInput = {
      tenantId,
      ...(query.active === undefined ? {} : { active: query.active }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.operationalRegisterType.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: { select: { records: { where: { deletedAt: null } } } },
        },
      }),
      this.db.operationalRegisterType.count({ where }),
    ]);
    return {
      data: items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        sourceSheet: item.sourceSheet,
        fields: item.fieldConfiguration,
        active: item.active,
        recordCount: item._count.records,
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  private async requireType(tenantId: string, registerCode: string) {
    const type = await this.db.operationalRegisterType.findUnique({
      where: { tenantId_code: { tenantId, code: registerCode } },
      select: { id: true, code: true, name: true },
    });
    if (!type) throw notFound("Operational register not found");
    return type;
  }

  async listRecords(
    tenantId: string,
    registerCode: string,
    query: RegisterRecordListQuery,
  ) {
    const type = await this.requireType(tenantId, registerCode);
    const now = new Date();
    const where: Prisma.OperationalRegisterRecordWhereInput = {
      tenantId,
      registerTypeId: type.id,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.overdue ? { dueDate: { lt: now } } : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueDate: {
              ...(query.dueFrom
                ? { gte: new Date(`${query.dueFrom}T00:00:00.000Z`) }
                : {}),
              ...(query.dueTo
                ? { lte: new Date(`${query.dueTo}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              {
                businessRecordCode: {
                  contains: query.q,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.operationalRegisterRecord.findMany({
        where,
        include: recordInclude,
        orderBy:
          query.orderBy === undefined
            ? [{ businessRecordCode: "asc" }]
            : [
                { [query.orderBy]: query.order ?? "asc" },
                { businessRecordCode: "asc" },
              ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.operationalRegisterRecord.count({ where }),
    ]);
    return {
      data: items.map((item) => registerRecordDto(item, now)),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async getRecord(tenantId: string, registerCode: string, recordId: string) {
    const type = await this.requireType(tenantId, registerCode);
    const record = await this.db.operationalRegisterRecord.findFirst({
      where: {
        tenantId,
        registerTypeId: type.id,
        id: recordId,
        deletedAt: null,
      },
      include: recordInclude,
    });
    if (!record) throw notFound("Register record not found");
    return registerRecordDto(record);
  }

  /** Rejects any owner or department that is not in the authenticated company. */
  private async assertSameCompany(
    tx: Prisma.TransactionClient,
    tenantId: string,
    references: {
      ownerId?: string | null | undefined;
      departmentId?: string | null | undefined;
    },
  ) {
    const invalid: string[] = [];
    if (references.ownerId) {
      const membership = await tx.userCompany.findFirst({
        where: {
          tenantId,
          userId: references.ownerId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
        select: { id: true },
      });
      if (!membership) invalid.push("ownerId");
    }
    if (references.departmentId) {
      const department = await tx.orgDepartment.findFirst({
        where: { tenantId, id: references.departmentId },
        select: { id: true },
      });
      if (!department) invalid.push("departmentId");
    }
    if (invalid.length > 0) {
      throw new AppError(
        400,
        "RELATED_RECORD_INVALID",
        "One or more referenced records are not available in this company",
        { fields: invalid },
      );
    }
  }

  async createRecord(
    tenantId: string,
    registerCode: string,
    actorUserId: string,
    body: CreateRegisterRecordBody,
    context: AuditContext,
  ) {
    const type = await this.requireType(tenantId, registerCode);
    return this.db.$transaction(async (tx) => {
      await this.assertSameCompany(tx, tenantId, body);
      const duplicate = await tx.operationalRegisterRecord.findUnique({
        where: {
          tenantId_registerTypeId_businessRecordCode: {
            tenantId,
            registerTypeId: type.id,
            businessRecordCode: body.businessRecordCode,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppError(
          409,
          "CONFLICT",
          "A record with this business code already exists in this register",
        );
      }
      const record = await tx.operationalRegisterRecord.create({
        data: {
          tenantId,
          registerTypeId: type.id,
          businessRecordCode: body.businessRecordCode,
          title: body.title,
          status: body.status ?? null,
          ownerId: body.ownerId ?? null,
          departmentId: body.departmentId ?? null,
          recordDate: body.recordDate
            ? new Date(`${body.recordDate}T00:00:00.000Z`)
            : null,
          dueDate: body.dueDate
            ? new Date(`${body.dueDate}T00:00:00.000Z`)
            : null,
          payload: body.payload ?? {},
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: recordInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "REGISTER_RECORD_CREATED",
        entityType: "OPERATIONAL_REGISTER_RECORD",
        entityId: record.id,
        metadata: {
          register: type.code,
          businessRecordCode: record.businessRecordCode,
        },
        context,
      });
      return registerRecordDto(record);
    });
  }

  async updateRecord(
    tenantId: string,
    registerCode: string,
    recordId: string,
    actorUserId: string,
    body: UpdateRegisterRecordBody,
    context: AuditContext,
  ) {
    const type = await this.requireType(tenantId, registerCode);
    return this.db.$transaction(async (tx) => {
      const existing = await tx.operationalRegisterRecord.findFirst({
        where: {
          tenantId,
          registerTypeId: type.id,
          id: recordId,
          deletedAt: null,
        },
        select: { id: true, businessRecordCode: true },
      });
      if (!existing) throw notFound("Register record not found");
      await this.assertSameCompany(tx, tenantId, body);
      const record = await tx.operationalRegisterRecord.update({
        where: { id: recordId },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(body.ownerId === undefined ? {} : { ownerId: body.ownerId }),
          ...(body.departmentId === undefined
            ? {}
            : { departmentId: body.departmentId }),
          ...(body.recordDate === undefined
            ? {}
            : {
                recordDate: body.recordDate
                  ? new Date(`${body.recordDate}T00:00:00.000Z`)
                  : null,
              }),
          ...(body.dueDate === undefined
            ? {}
            : {
                dueDate: body.dueDate
                  ? new Date(`${body.dueDate}T00:00:00.000Z`)
                  : null,
              }),
          ...(body.payload === undefined ? {} : { payload: body.payload }),
          updatedById: actorUserId,
        },
        include: recordInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "REGISTER_RECORD_UPDATED",
        entityType: "OPERATIONAL_REGISTER_RECORD",
        entityId: record.id,
        metadata: {
          register: type.code,
          businessRecordCode: record.businessRecordCode,
          fields: Object.keys(body),
        },
        context,
      });
      return registerRecordDto(record);
    });
  }
}
