import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { EvidenceGateService } from "../evidence/evidence-gate-service.js";
import {
  assertClosureNote,
  assertGapTransition,
  assertNoOpenCapas,
  isGapOverdue,
} from "./domain.js";
import {
  type AuditContext,
  type GapRecord,
  type GapRepository,
  gapInclude,
  writeAudit,
} from "./repository.js";
import type {
  AssignGapOwnerBody,
  CloseGapBody,
  CreateGapBody,
  GapListQuery,
  LinkGapEvidenceBody,
  ReopenGapBody,
  UpdateGapBody,
} from "./validators.js";

const GAP_CODE_MINIMUM_DIGITS = 3;

export const formatGapCode = (value: number) =>
  `GAP-${String(value).padStart(GAP_CODE_MINIMUM_DIGITS, "0")}`;

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const gapNotFound = () => notFound("Gap not found");

export const gapDto = (record: GapRecord, asOf = new Date()) => ({
  id: record.id,
  code: record.code,
  title: record.title,
  description: record.description,
  severity: record.severity,
  status: record.status,
  source: record.source,
  clauseRef: record.clauseRef,
  recommendedAction: record.recommendedAction,
  owner: personDto(record.owner),
  /**
   * The owner token the client workbook carried, kept so an imported record
   * stays traceable without provisioning an account for a spreadsheet name.
   */
  sourceOwnerRef: record.sourceOwnerRef,
  department: record.department,
  framework: record.framework,
  frameworkRule: record.frameworkRule,
  control: record.control,
  checkpoint: record.checkpoint,
  identifiedOn: dateOnly(record.identifiedOn),
  dueDate: dateOnly(record.dueDate),
  overdue: isGapOverdue(record.dueDate, record.status, asOf),
  closedAt: record.closedAt,
  closureNote: record.closureNote,
  needsReview: record.needsReview,
  reviewReason: record.reviewReason,
  capas: record.capas.map((capa) => ({
    id: capa.id,
    code: capa.code,
    title: capa.title,
    status: capa.status,
    priority: capa.priority,
    dueDate: dateOnly(capa.dueDate),
    completionPercentage: capa.completionPercentage,
  })),
  evidence: record.evidenceLinks.map((link) => ({
    linkId: link.id,
    id: link.evidence.id,
    code: link.evidence.code,
    title: link.evidence.title,
    lifecycleStatus: link.evidence.lifecycleStatus,
    // Never claim a file exists: only a stored key means bytes are held.
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
 * Confirms every referenced record belongs to the authenticated company.
 *
 * A cross-company reference is rejected as a bad request rather than a 404, so
 * the caller learns the reference is unusable without learning whether an id
 * exists in another company.
 */
const assertSameCompany = async (
  tx: Prisma.TransactionClient,
  tenantId: string,
  references: {
    ownerId?: string | null | undefined;
    departmentId?: string | null | undefined;
    frameworkRuleId?: string | null | undefined;
    controlId?: string | null | undefined;
    checkpointId?: string | null | undefined;
    frameworkId?: string | null | undefined;
  },
) => {
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
  if (references.controlId) {
    const control = await tx.control.findFirst({
      where: { tenantId, id: references.controlId },
      select: { id: true },
    });
    if (!control) invalid.push("controlId");
  }
  if (references.checkpointId) {
    const checkpoint = await tx.checkpoint.findFirst({
      where: { tenantId, id: references.checkpointId },
      select: { id: true },
    });
    if (!checkpoint) invalid.push("checkpointId");
  }
  // Frameworks and their rules are global shared masters, so they are checked
  // for existence rather than company ownership.
  if (references.frameworkId) {
    const framework = await tx.framework.findUnique({
      where: { id: references.frameworkId },
      select: { id: true },
    });
    if (!framework) invalid.push("frameworkId");
  }
  if (references.frameworkRuleId) {
    const rule = await tx.frameworkRule.findUnique({
      where: { id: references.frameworkRuleId },
      select: { id: true },
    });
    if (!rule) invalid.push("frameworkRuleId");
  }
  if (invalid.length > 0) {
    throw new AppError(
      400,
      "RELATED_RECORD_INVALID",
      "One or more referenced records are not available in this company",
      { fields: invalid },
    );
  }
  return true as const;
};

/** Converts a `YYYY-MM-DD` body field to the UTC midnight the column stores. */
const toDate = (value: string | null) =>
  value === null ? null : new Date(`${value}T00:00:00.000Z`);

export class GapService {
  constructor(
    private readonly repository: GapRepository,
    private readonly evidenceGate: EvidenceGateService,
  ) {}

  async list(tenantId: string, query: GapListQuery) {
    const result = await this.repository.list(tenantId, query);
    const asOf = new Date();
    return {
      data: result.items.map((item) => gapDto(item, asOf)),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, id: string) {
    const gap = await this.repository.find(tenantId, id);
    if (!gap) throw gapNotFound();
    return gapDto(gap);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateGapBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      await assertSameCompany(tx, tenantId, body);
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextGapNumber: { increment: 1 } },
        select: { nextGapNumber: true },
      });
      const gap = await tx.gap.create({
        data: {
          tenantId,
          code: formatGapCode(tenant.nextGapNumber - 1),
          title: body.title,
          description: body.description ?? null,
          severity: body.severity,
          status: "OPEN",
          source: body.source ?? null,
          frameworkId: body.frameworkId ?? null,
          frameworkRuleId: body.frameworkRuleId ?? null,
          controlId: body.controlId ?? null,
          checkpointId: body.checkpointId ?? null,
          clauseRef: body.clauseRef ?? null,
          recommendedAction: body.recommendedAction ?? null,
          ownerId: body.ownerId ?? null,
          departmentId: body.departmentId ?? null,
          identifiedOn: toDate(body.identifiedOn ?? null),
          dueDate: toDate(body.dueDate ?? null),
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: gapInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_CREATED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, severity: gap.severity },
        context,
      });
      return gapDto(gap);
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: UpdateGapBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw gapNotFound();
      if (existing.status === "CLOSED") {
        throw new AppError(
          409,
          "INVALID_STATUS_TRANSITION",
          "Use POST /gaps/:gapId/reopen before editing a closed Gap",
        );
      }
      await assertSameCompany(tx, tenantId, body);
      if (body.status) assertGapTransition(existing.status, body.status);
      const gap = await tx.gap.update({
        where: { id },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined
            ? {}
            : { description: body.description }),
          ...(body.severity === undefined ? {} : { severity: body.severity }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(body.source === undefined ? {} : { source: body.source }),
          ...(body.frameworkId === undefined
            ? {}
            : { frameworkId: body.frameworkId }),
          ...(body.frameworkRuleId === undefined
            ? {}
            : { frameworkRuleId: body.frameworkRuleId }),
          ...(body.controlId === undefined
            ? {}
            : { controlId: body.controlId }),
          ...(body.checkpointId === undefined
            ? {}
            : { checkpointId: body.checkpointId }),
          ...(body.clauseRef === undefined
            ? {}
            : { clauseRef: body.clauseRef }),
          ...(body.recommendedAction === undefined
            ? {}
            : { recommendedAction: body.recommendedAction }),
          ...(body.departmentId === undefined
            ? {}
            : { departmentId: body.departmentId }),
          ...(body.identifiedOn === undefined
            ? {}
            : { identifiedOn: toDate(body.identifiedOn) }),
          ...(body.dueDate === undefined
            ? {}
            : { dueDate: toDate(body.dueDate) }),
          updatedById: actorUserId,
        },
        include: gapInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_UPDATED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, fields: Object.keys(body) },
        context,
      });
      return gapDto(gap);
    });
  }

  async assignOwner(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: AssignGapOwnerBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await tx.gap.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!existing) throw gapNotFound();
      await assertSameCompany(tx, tenantId, { ownerId: body.ownerId });
      const gap = await tx.gap.update({
        where: { id },
        data: { ownerId: body.ownerId, updatedById: actorUserId },
        include: gapInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_OWNER_ASSIGNED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, ownerId: body.ownerId },
        context,
      });
      return gapDto(gap);
    });
  }

  /**
   * Closes a gap. Requires the `gaps:close` permission at the route, a closure
   * note here, and no CAPA still open against the finding.
   */
  async close(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: CloseGapBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw gapNotFound();
      assertGapTransition(existing.status, "CLOSED", { allowSelf: false });
      const closureNote = assertClosureNote(body.closureNote);
      const openCapas = await tx.capa.findMany({
        where: {
          tenantId,
          gapId: id,
          deletedAt: null,
          status: { notIn: ["CLOSED", "CANCELLED"] },
        },
        select: { code: true },
      });
      assertNoOpenCapas(openCapas.map((capa) => capa.code));
      await this.evidenceGate.assertGapClosureSatisfied({
        tenantId,
        gapId: id,
        tx,
      });
      const gap = await tx.gap.update({
        where: { id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closureNote,
          updatedById: actorUserId,
        },
        include: gapInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_CLOSED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, previousStatus: existing.status },
        context,
      });
      return gapDto(gap);
    });
  }

  async reopen(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: ReopenGapBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.lockLifecycle(tx, tenantId, id);
      if (!existing) throw gapNotFound();
      assertGapTransition(existing.status, "IN_PROGRESS");
      const gap = await tx.gap.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          closedAt: null,
          closureNote: null,
          updatedById: actorUserId,
        },
        include: gapInclude,
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_REOPENED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, reason: body.reason ?? null },
        context,
      });
      return gapDto(gap);
    });
  }

  async linkEvidence(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: LinkGapEvidenceBody,
    context: AuditContext,
  ) {
    return this.repository.runTransaction(async (tx) => {
      const existing = await tx.gap.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!existing) throw gapNotFound();
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
      await tx.gapEvidenceLink.upsert({
        where: {
          tenantId_gapId_evidenceId: {
            tenantId,
            gapId: id,
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
          gapId: id,
          evidenceId: body.evidenceId,
          linkReason: body.linkReason ?? null,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_EVIDENCE_LINKED",
        entityType: "GAP",
        entityId: id,
        metadata: { code: existing.code, evidenceCode: evidence.code },
        context,
      });
      const gap = await tx.gap.findFirstOrThrow({
        where: { tenantId, id },
        include: gapInclude,
      });
      return gapDto(gap);
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
      const link = await tx.gapEvidenceLink.findFirst({
        where: { tenantId, gapId: id, evidenceId, isActive: true },
        select: { id: true },
      });
      if (!link) throw notFound("Evidence link not found");
      await tx.gapEvidenceLink.update({
        where: { id: link.id },
        data: { isActive: false, updatedById: actorUserId },
      });
      await writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "GAP_EVIDENCE_UNLINKED",
        entityType: "GAP",
        entityId: id,
        metadata: { evidenceId },
        context,
      });
      const gap = await tx.gap.findFirstOrThrow({
        where: { tenantId, id },
        include: gapInclude,
      });
      return gapDto(gap);
    });
  }
}
