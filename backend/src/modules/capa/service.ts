import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { EvidenceGateService } from "../evidence/evidence-gate-service.js";
import {
  assertCapaTransition,
  assertClosureNote,
  closureCompletionPercentage,
  isCapaOverdue,
} from "../gaps/domain.js";
import { type AuditContext, writeAudit } from "../gaps/repository.js";
import {
  capaInclude,
  type CapaRecord,
  type CapaRepository,
} from "./repository.js";
import type {
  AssignCapaOwnerBody,
  CapaListQuery,
  CloseCapaBody,
  CreateCapaBody,
  LinkCapaEvidenceBody,
  ReopenCapaBody,
  UpdateCapaBody,
} from "./validators.js";

const CAPA_CODE_MINIMUM_DIGITS = 3;

export const formatCapaCode = (value: number) =>
  `CAPA-${String(value).padStart(CAPA_CODE_MINIMUM_DIGITS, "0")}`;

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const capaNotFound = () => notFound("CAPA not found");

export const capaDto = (record: CapaRecord, asOf = new Date()) => ({
  id: record.id,
  code: record.code,
  title: record.title,
  description: record.description,
  priority: record.priority,
  status: record.status,
  gap: record.gap
    ? {
        id: record.gap.id,
        code: record.gap.code,
        title: record.gap.title,
        severity: record.gap.severity,
        status: record.gap.status,
      }
    : null,
  source: record.source,
  sourceRef: record.sourceRef,
  framework: record.framework,
  rootCause: record.rootCause,
  correctiveAction: record.correctiveAction,
  preventiveAction: record.preventiveAction,
  owner: personDto(record.owner),
  sourceOwnerRef: record.sourceOwnerRef,
  department: record.department,
  raisedOn: dateOnly(record.raisedOn),
  dueDate: dateOnly(record.dueDate),
  overdue: isCapaOverdue(record.dueDate, record.status, asOf),
  completionPercentage: record.completionPercentage,
  closedAt: record.closedAt,
  closureNote: record.closureNote,
  needsReview: record.needsReview,
  reviewReason: record.reviewReason,
  evidence: record.evidenceLinks.map((link) => ({
    linkId: link.id,
    id: link.evidence.id,
    code: link.evidence.code,
    title: link.evidence.title,
    lifecycleStatus: link.evidence.lifecycleStatus,
    file: {
      available: link.evidence.storageKey !== null,
      sourceReference: link.evidence.sourceFileReference,
    },
    linkReason: link.linkReason,
    linkedAt: link.createdAt,
  })),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

/**
 * Every reference a CAPA can carry must resolve inside the authenticated
 * company. A linked gap in another company would silently join two tenants'
 * compliance records, so it is rejected outright. A Gap lifecycle lock also
 * prevents an open CAPA from being attached while that Gap is closing.
 */
const assertSameCompany = async (
  tx: Prisma.TransactionClient,
  tenantId: string,
  references: {
    ownerId?: string | null | undefined;
    departmentId?: string | null | undefined;
    gapId?: string | null | undefined;
    frameworkId?: string | null | undefined;
  },
  repository: CapaRepository,
  options: { requireActiveGap?: boolean } = {},
) => {
  const invalid: string[] = [];
  let closedGap = false;
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
  if (references.gapId) {
    const gap = await repository.lockGapReference(
      tx,
      tenantId,
      references.gapId,
    );
    if (!gap) invalid.push("gapId");
    else if (options.requireActiveGap && gap.status === "CLOSED") {
      closedGap = true;
    }
  }
  if (references.frameworkId) {
    const framework = await tx.framework.findUnique({
      where: { id: references.frameworkId },
      select: { id: true },
    });
    if (!framework) invalid.push("frameworkId");
  }
  if (invalid.length > 0) {
    throw new AppError(
      400,
      "RELATED_RECORD_INVALID",
      "One or more referenced records are not available in this company",
      { fields: invalid },
    );
  }
  if (closedGap) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      "An active CAPA cannot be linked to a closed Gap",
    );
  }
  return true as const;
};

/** Converts a `YYYY-MM-DD` body field to the UTC midnight the column stores. */
const toDate = (value: string | null) =>
  value === null ? null : new Date(`${value}T00:00:00.000Z`);

export class CapaService {
  constructor(
    private readonly repository: CapaRepository,
    private readonly evidenceGate: EvidenceGateService,
  ) {}

  async list(tenantId: string, query: CapaListQuery) {
    const result = await this.repository.list(tenantId, query);
    const asOf = new Date();
    return {
      data: result.items.map((item) => capaDto(item, asOf)),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, id: string) {
    const capa = await this.repository.find(tenantId, id);
    if (!capa) throw capaNotFound();
    return capaDto(capa);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateCapaBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      await assertSameCompany(tx, tenantId, body, this.repository, {
        requireActiveGap: true,
      });
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextCapaNumber: { increment: 1 } },
        select: { nextCapaNumber: true },
      });
      const capa = await tx.capa.create({
        data: {
          tenantId,
          code: formatCapaCode(tenant.nextCapaNumber - 1),
          title: body.title,
          description: body.description ?? null,
          gapId: body.gapId ?? null,
          priority: body.priority,
          status: "OPEN",
          source: body.source ?? null,
          sourceRef: body.sourceRef ?? null,
          frameworkId: body.frameworkId ?? null,
          rootCause: body.rootCause ?? null,
          correctiveAction: body.correctiveAction ?? null,
          preventiveAction: body.preventiveAction ?? null,
          ownerId: body.ownerId ?? null,
          departmentId: body.departmentId ?? null,
          raisedOn: toDate(body.raisedOn ?? null),
          dueDate: toDate(body.dueDate ?? null),
          completionPercentage: body.completionPercentage ?? 0,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: capaInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_CREATED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: {
          code: capa.code,
          priority: capa.priority,
          gapId: capa.gapId,
        },
        context,
      });
      return capaDto(capa);
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: UpdateCapaBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw capaNotFound();
      if (existing.status === "CLOSED") {
        throw new AppError(
          409,
          "INVALID_STATUS_TRANSITION",
          "Use POST /capas/:capaId/reopen before editing a closed CAPA",
        );
      }
      const nextStatus = body.status ?? existing.status;
      const gapIdForValidation =
        body.gapId !== undefined
          ? body.gapId
          : body.status !== undefined
            ? existing.gapId
            : undefined;
      await assertSameCompany(
        tx,
        tenantId,
        { ...body, gapId: gapIdForValidation },
        this.repository,
        {
          requireActiveGap:
            nextStatus !== "CLOSED" && nextStatus !== "CANCELLED",
        },
      );
      if (body.status) assertCapaTransition(existing.status, body.status);
      const capa = await tx.capa.update({
        where: { id },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined
            ? {}
            : { description: body.description }),
          ...(body.gapId === undefined ? {} : { gapId: body.gapId }),
          ...(body.priority === undefined ? {} : { priority: body.priority }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(body.source === undefined ? {} : { source: body.source }),
          ...(body.sourceRef === undefined
            ? {}
            : { sourceRef: body.sourceRef }),
          ...(body.frameworkId === undefined
            ? {}
            : { frameworkId: body.frameworkId }),
          ...(body.rootCause === undefined
            ? {}
            : { rootCause: body.rootCause }),
          ...(body.correctiveAction === undefined
            ? {}
            : { correctiveAction: body.correctiveAction }),
          ...(body.preventiveAction === undefined
            ? {}
            : { preventiveAction: body.preventiveAction }),
          ...(body.departmentId === undefined
            ? {}
            : { departmentId: body.departmentId }),
          ...(body.raisedOn === undefined
            ? {}
            : { raisedOn: toDate(body.raisedOn) }),
          ...(body.dueDate === undefined
            ? {}
            : { dueDate: toDate(body.dueDate) }),
          ...(body.completionPercentage === undefined
            ? {}
            : { completionPercentage: body.completionPercentage }),
          updatedById: actorUserId,
        },
        include: capaInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_UPDATED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: { code: capa.code, fields: Object.keys(body) },
        context,
      });
      return capaDto(capa);
    });
  }

  async assignOwner(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: AssignCapaOwnerBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await tx.capa.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!existing) throw capaNotFound();
      await assertSameCompany(
        tx,
        tenantId,
        { ownerId: body.ownerId },
        this.repository,
      );
      const capa = await tx.capa.update({
        where: { id },
        data: { ownerId: body.ownerId, updatedById: actorUserId },
        include: capaInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_OWNER_ASSIGNED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: { code: capa.code, ownerId: body.ownerId },
        context,
      });
      return capaDto(capa);
    });
  }

  /**
   * Closes a CAPA. Requires `capa:close`, a closure note, and drives
   * completion to 100% so a closed action never reports partial progress.
   */
  async close(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: CloseCapaBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw capaNotFound();
      assertCapaTransition(existing.status, "CLOSED", { allowSelf: false });
      const closureNote = assertClosureNote(body.closureNote);
      await this.evidenceGate.assertCapaClosureSatisfied({
        tenantId,
        capaId: id,
        tx,
      });
      const capa = await tx.capa.update({
        where: { id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closureNote,
          completionPercentage: closureCompletionPercentage(
            existing.completionPercentage,
          ),
          updatedById: actorUserId,
        },
        include: capaInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_CLOSED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: { code: capa.code, previousStatus: existing.status },
        context,
      });
      return capaDto(capa);
    });
  }

  async reopen(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: ReopenCapaBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw capaNotFound();
      assertCapaTransition(existing.status, "IN_PROGRESS");
      if (existing.gapId !== null) {
        await assertSameCompany(
          tx,
          tenantId,
          { gapId: existing.gapId },
          this.repository,
          { requireActiveGap: true },
        );
      }
      const capa = await tx.capa.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          closedAt: null,
          closureNote: null,
          updatedById: actorUserId,
        },
        include: capaInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_REOPENED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: { code: capa.code, reason: body.reason ?? null },
        context,
      });
      return capaDto(capa);
    });
  }

  async linkEvidence(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: LinkCapaEvidenceBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await tx.capa.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!existing) throw capaNotFound();
      const evidence = await tx.evidence.findFirst({
        where: { tenantId, id: body.evidenceId },
        select: { id: true, code: true },
      });
      if (!evidence) {
        throw new AppError(
          400,
          "RELATED_RECORD_INVALID",
          "The Evidence record is not available in this company",
          { fields: ["evidenceId"] },
        );
      }
      await tx.capaEvidenceLink.upsert({
        where: {
          tenantId_capaId_evidenceId: {
            tenantId,
            capaId: id,
            evidenceId: body.evidenceId,
          },
        },
        update: {
          isActive: true,
          linkReason: body.linkReason ?? null,
          updatedById: actorUserId,
        },
        create: {
          tenantId,
          capaId: id,
          evidenceId: body.evidenceId,
          linkReason: body.linkReason ?? null,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_EVIDENCE_LINKED",
        entityType: "CAPA",
        entityId: id,
        metadata: { code: existing.code, evidenceCode: evidence.code },
        context,
      });
      const capa = await tx.capa.findFirstOrThrow({
        where: { tenantId, id },
        include: capaInclude,
      });
      return capaDto(capa);
    });
  }

  async unlinkEvidence(
    tenantId: string,
    id: string,
    evidenceId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const link = await tx.capaEvidenceLink.findFirst({
        where: { tenantId, capaId: id, evidenceId, isActive: true },
        select: { id: true },
      });
      if (!link) throw notFound("Evidence link not found");
      await tx.capaEvidenceLink.update({
        where: { id: link.id },
        data: { isActive: false, updatedById: actorUserId },
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CAPA_EVIDENCE_UNLINKED",
        entityType: "CAPA",
        entityId: id,
        metadata: { evidenceId },
        context,
      });
      const capa = await tx.capa.findFirstOrThrow({
        where: { tenantId, id },
        include: capaInclude,
      });
      return capaDto(capa);
    });
  }
}
