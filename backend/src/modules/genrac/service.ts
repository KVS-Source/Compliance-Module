import { access } from "node:fs/promises";
import { basename, isAbsolute, resolve, sep } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { GenracCsvAdapter } from "./adapters/csv-adapter.js";
import {
  isProtectedLocalType,
  type ExternalConnector,
} from "./connector.js";

const SYSTEM_CODE = "GENRAC";

/** GenRAC CSV files must live under `{LOCAL_UPLOAD_DIR}/.genrac`. */
export const genracCsvRoot = () => resolve(env.LOCAL_UPLOAD_DIR, ".genrac");

/**
 * Validates a CSV filename for configure-csv. Rejects empty, `.`, `..`,
 * absolute paths, traversal, and path separators. Resolved path must stay
 * under the GenRAC CSV root with a root+sep boundary.
 */
export const assertSafeGenracCsvFilename = (filename: string): string => {
  const trimmed = filename.trim();
  if (!trimmed) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "CSV filename must be a simple name under the GenRAC upload root",
    );
  }
  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    isAbsolute(trimmed) ||
    basename(trimmed) !== trimmed
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "CSV filename must be a simple name under the GenRAC upload root",
    );
  }
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== trimmed || safe === "." || safe === "..") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "CSV filename must be a simple name under the GenRAC upload root",
    );
  }
  return safe;
};

export const resolveGenracCsvPath = (
  filename: string,
  root = genracCsvRoot(),
): string => {
  const safe = assertSafeGenracCsvFilename(filename);
  const resolvedRoot = resolve(root);
  const absolute = resolve(resolvedRoot, safe);
  if (absolute !== resolvedRoot && !absolute.startsWith(resolvedRoot + sep)) {
    throw new AppError(
      400,
      "GENRAC_PATH_INVALID",
      "CSV path must stay under the GenRAC upload root",
    );
  }
  if (absolute === resolvedRoot) {
    throw new AppError(
      400,
      "GENRAC_PATH_INVALID",
      "CSV path must stay under the GenRAC upload root",
    );
  }
  return absolute;
};

const publicConnection = (row: {
  id: string;
  systemCode: string;
  displayName: string;
  connectorType: string;
  status: string;
  config: unknown;
  secretRefKeys: unknown;
  lastTestedAt: Date | null;
  lastTestSuccess: boolean | null;
  lastTestMessage: string | null;
  lastSuccessfulSyncAt: Date | null;
  lastAttemptedSyncAt: Date | null;
  updatedAt: Date;
}) => ({
  id: row.id,
  systemCode: row.systemCode,
  displayName: row.displayName,
  connectorType: row.connectorType,
  status: row.status,
  // Never return secret values — only the names of env refs when configured.
  secretRefKeys: Array.isArray(row.secretRefKeys) ? row.secretRefKeys : [],
  config: sanitiseConfig(row.config),
  lastTestedAt: row.lastTestedAt,
  lastTestSuccess: row.lastTestSuccess,
  lastTestMessage: row.lastTestMessage,
  lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
  lastAttemptedSyncAt: row.lastAttemptedSyncAt,
  updatedAt: row.updatedAt,
  configurationExplanation:
    row.status === "NOT_CONFIGURED"
      ? "GenRAC credentials and connection settings are not configured. Live REST/database sync remains unavailable."
      : undefined,
});

const sanitiseConfig = (config: unknown) => {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (/(password|token|secret|credential)/i.test(key)) continue;
    out[key] = value;
  }
  return out;
};

export class GenracSyncService {
  constructor(private readonly db: PrismaClient) {}

  async ensurePlaceholder(tenantId: string) {
    return this.db.externalSystemConnection.upsert({
      where: {
        tenantId_systemCode: { tenantId, systemCode: SYSTEM_CODE },
      },
      update: {},
      create: {
        tenantId,
        systemCode: SYSTEM_CODE,
        displayName: "GenRAC",
        connectorType: "CSV_FILE",
        status: "NOT_CONFIGURED",
        config: {},
        secretRefKeys: [],
      },
    });
  }

  async status(tenantId: string) {
    const connection = await this.ensurePlaceholder(tenantId);
    const [mapCount, lastRun] = await Promise.all([
      this.db.externalRecordMap.count({
        where: { tenantId, connectionId: connection.id },
      }),
      this.db.syncRun.findFirst({
        where: { tenantId, connectionId: connection.id },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          mode: true,
          createCount: true,
          updateCount: true,
          conflictCount: true,
          invalidCount: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);
    return {
      connection: publicConnection(connection),
      mappingCount: mapCount,
      lastSyncRun: lastRun,
      liveAccess: false,
      adapters: {
        csvFile: connection.status !== "NOT_CONFIGURED" &&
          connection.connectorType === "CSV_FILE",
        rest: false,
        postgresReadonly: false,
      },
    };
  }

  private resolveConnector(
    connection: {
      connectorType: string;
      status: string;
      config: unknown;
    },
  ): ExternalConnector {
    if (connection.status === "NOT_CONFIGURED") {
      throw new AppError(
        409,
        "GENRAC_NOT_CONFIGURED",
        "GenRAC is not configured. Configure a CSV adapter path reference or wait for approved live access.",
      );
    }
    if (connection.connectorType === "CSV_FILE") {
      const cfg = connection.config as { csvPathRef?: string };
      const ref = cfg.csvPathRef;
      if (!ref || typeof ref !== "string") {
        throw new AppError(
          409,
          "GENRAC_NOT_CONFIGURED",
          "CSV adapter path reference is missing",
        );
      }
      // Filename-only refs; never accept absolute or traversal paths from config.
      const absolute = resolveGenracCsvPath(ref);
      return new GenracCsvAdapter(absolute);
    }
    if (connection.connectorType === "REST") {
      throw new AppError(
        409,
        "GENRAC_NOT_CONFIGURED",
        "REST adapter is configuration-ready but live GenRAC access is not available",
      );
    }
    throw new AppError(
      409,
      "GENRAC_NOT_CONFIGURED",
      "PostgreSQL adapter is configuration-ready only and is not enabled without reviewed access",
    );
  }

  async testConnection(tenantId: string) {
    const connection = await this.ensurePlaceholder(tenantId);
    try {
      const connector = this.resolveConnector(connection);
      const result = await connector.testConnection();
      await this.db.externalSystemConnection.update({
        where: { id: connection.id },
        data: {
          lastTestedAt: new Date(),
          lastTestSuccess: result.ok,
          lastTestMessage: result.message.slice(0, 500),
          status: result.ok ? "CONFIGURED" : "ERROR",
        },
      });
      await this.db.auditEvent.create({
        data: {
          tenantId,
          action: "GENRAC_CONNECTION_TESTED",
          entityType: "EXTERNAL_SYSTEM_CONNECTION",
          entityId: connection.id,
          source: "EXTERNAL_SYNC",
          metadata: { ok: result.ok, message: result.message },
        },
      });
      return result;
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "Connection test failed";
      await this.db.externalSystemConnection.update({
        where: { id: connection.id },
        data: {
          lastTestedAt: new Date(),
          lastTestSuccess: false,
          lastTestMessage: message.slice(0, 500),
        },
      });
      throw error;
    }
  }

  /**
   * Enables the CSV adapter for local testing by registering a path reference
   * under LOCAL_UPLOAD_DIR/.genrac. Does not accept arbitrary filesystem paths
   * from the browser — only a filename under the GenRAC root. Rejects before
   * marking CONFIGURED when the path is unsafe or the file is missing.
   */
  async configureCsvAdapter(tenantId: string, filename: string) {
    const safe = assertSafeGenracCsvFilename(filename);
    const absolute = resolveGenracCsvPath(safe);
    try {
      await access(absolute);
    } catch {
      throw new AppError(
        400,
        "GENRAC_CSV_MISSING",
        "CSV file was not found under the GenRAC upload root",
      );
    }
    const connection = await this.ensurePlaceholder(tenantId);
    return publicConnection(
      await this.db.externalSystemConnection.update({
        where: { id: connection.id },
        data: {
          connectorType: "CSV_FILE",
          status: "CONFIGURED",
          config: { csvPathRef: safe },
          secretRefKeys: [],
        },
      }),
    );
  }

  async preview(tenantId: string, actorUserId: string, requestId?: string) {
    const connection = await this.ensurePlaceholder(tenantId);
    const connector = this.resolveConnector(connection);
    const { changes } = await connector.fetchChanges();
    const { counts, validations } = await connector.preview(changes);

    // Reclassify create → skip/update using existing external-record maps.
    const adjusted = {
      create: 0,
      update: 0,
      conflict: counts.conflict,
      invalid: counts.invalid,
      skip: counts.skip,
    };
    for (const item of validations) {
      if (!item.ok) continue;
      if (isProtectedLocalType(item.localEntityType)) {
        adjusted.conflict += 1;
        continue;
      }
      const existing = await this.db.externalRecordMap.findUnique({
        where: {
          tenantId_connectionId_sourceEntityType_externalRecordId: {
            tenantId,
            connectionId: connection.id,
            sourceEntityType: item.change.sourceEntityType,
            externalRecordId: item.change.externalRecordId,
          },
        },
      });
      if (existing?.status === "DEACTIVATED") {
        adjusted.skip += 1;
        continue;
      }
      if (existing && existing.syncHash === item.change.syncHash) {
        adjusted.skip += 1;
        continue;
      }
      if (
        existing?.localEntityId &&
        isProtectedLocalType(existing.localEntityType)
      ) {
        adjusted.conflict += 1;
        continue;
      }
      if (existing) adjusted.update += 1;
      else adjusted.create += 1;
    }

    const run = await this.db.syncRun.create({
      data: {
        tenantId,
        connectionId: connection.id,
        status: "PREVIEWED",
        mode: "PREVIEW",
        createCount: adjusted.create,
        updateCount: adjusted.update,
        conflictCount: adjusted.conflict,
        invalidCount: adjusted.invalid,
        skipCount: adjusted.skip,
        errorSummary: validations
          .filter((item) => !item.ok)
          .slice(0, 50)
          .map((item) =>
            item.ok
              ? null
              : {
                  entity: item.change.sourceEntityType,
                  externalId: item.change.externalRecordId,
                  reason: item.reason,
                },
          )
          .filter(Boolean),
        report: { changeCount: changes.length },
        completedAt: new Date(),
      },
    });

    await this.db.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: "GENRAC_SYNC_PREVIEWED",
        entityType: "SYNC_RUN",
        entityId: run.id,
        source: "EXTERNAL_SYNC",
        metadata: {
          counts: adjusted,
          ...(requestId ? { requestId } : {}),
        },
      },
    });

    return { syncRunId: run.id, counts: adjusted, changeCount: changes.length };
  }

  async commit(tenantId: string, actorUserId: string, requestId?: string) {
    const connection = await this.ensurePlaceholder(tenantId);
    const connector = this.resolveConnector(connection);
    const { changes } = await connector.fetchChanges();
    const { validations } = await connector.preview(changes);

    const counts = {
      create: 0,
      update: 0,
      conflict: 0,
      invalid: 0,
      skip: 0,
    };

    await this.db.$transaction(async (tx) => {
      for (const item of validations) {
        if (!item.ok) {
          counts.invalid += 1;
          continue;
        }
        if (isProtectedLocalType(item.localEntityType)) {
          counts.conflict += 1;
          continue;
        }
        const existing = await tx.externalRecordMap.findUnique({
          where: {
            tenantId_connectionId_sourceEntityType_externalRecordId: {
              tenantId,
              connectionId: connection.id,
              sourceEntityType: item.change.sourceEntityType,
              externalRecordId: item.change.externalRecordId,
            },
          },
        });
        if (existing?.status === "DEACTIVATED") {
          counts.skip += 1;
          continue;
        }
        if (existing && existing.syncHash === item.change.syncHash) {
          counts.skip += 1;
          continue;
        }
        if (
          existing?.localEntityId &&
          isProtectedLocalType(existing.localEntityType)
        ) {
          counts.conflict += 1;
          await tx.externalRecordMap.update({
            where: { id: existing.id },
            data: {
              status: "CONFLICT",
              conflictReason:
                "Refusing to overwrite GenBioCa-authoritative compliance data",
            },
          });
          continue;
        }
        await tx.externalRecordMap.upsert({
          where: {
            tenantId_connectionId_sourceEntityType_externalRecordId: {
              tenantId,
              connectionId: connection.id,
              sourceEntityType: item.change.sourceEntityType,
              externalRecordId: item.change.externalRecordId,
            },
          },
          update: {
            syncHash: item.change.syncHash,
            sourceUpdatedAt: item.change.sourceUpdatedAt ?? null,
            lastSyncedAt: new Date(),
            status: "ACTIVE",
            conflictReason: null,
            localEntityType: item.localEntityType,
          },
          create: {
            tenantId,
            connectionId: connection.id,
            sourceEntityType: item.change.sourceEntityType,
            externalRecordId: item.change.externalRecordId,
            localEntityType: item.localEntityType,
            syncHash: item.change.syncHash,
            sourceUpdatedAt: item.change.sourceUpdatedAt ?? null,
            lastSyncedAt: new Date(),
            status: "ACTIVE",
          },
        });
        if (existing) counts.update += 1;
        else counts.create += 1;
      }

      const run = await tx.syncRun.create({
        data: {
          tenantId,
          connectionId: connection.id,
          status:
            counts.conflict > 0 || counts.invalid > 0 ? "PARTIAL" : "COMPLETED",
          mode: "COMMIT",
          createCount: counts.create,
          updateCount: counts.update,
          conflictCount: counts.conflict,
          invalidCount: counts.invalid,
          skipCount: counts.skip,
          completedAt: new Date(),
          report: { changeCount: changes.length },
        },
      });

      await tx.externalSystemConnection.update({
        where: { id: connection.id },
        data: {
          lastAttemptedSyncAt: new Date(),
          lastSuccessfulSyncAt:
            counts.invalid === 0 && counts.conflict === 0
              ? new Date()
              : connection.lastSuccessfulSyncAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "GENRAC_SYNC_COMMITTED",
          entityType: "SYNC_RUN",
          entityId: run.id,
          source: "EXTERNAL_SYNC",
          metadata: {
            counts,
            ...(requestId ? { requestId } : {}),
          },
        },
      });

      return run;
    });

    return counts;
  }

  async history(
    tenantId: string,
    query: { page: number; pageSize: number },
  ) {
    const connection = await this.ensurePlaceholder(tenantId);
    const where = { tenantId, connectionId: connection.id };
    const [items, total] = await this.db.$transaction([
      this.db.syncRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.syncRun.count({ where }),
    ]);
    return { data: items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async getRun(tenantId: string, syncRunId: string) {
    const run = await this.db.syncRun.findFirst({
      where: { tenantId, id: syncRunId },
    });
    if (!run) throw notFound("Sync run not found");
    return run;
  }
}
