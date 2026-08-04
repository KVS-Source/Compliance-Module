import { app, defaultFileStorage } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import {
  previewExpiresAtFromReport,
  sweepExpiredImportPreviews,
} from "./modules/imports/preview-cleanup.js";

const start = async () => {
  await prisma.$connect();
  if (env.READINESS_STORAGE_CHECK === "true") {
    await defaultFileStorage.checkReady();
  }

  const runImportTempCleanup = async () => {
    try {
      await sweepExpiredImportPreviews({
        ttlHours: env.IMPORT_PREVIEW_TTL_HOURS,
        lookupPreview: async (tenantId, batchId) => {
          const batch = await prisma.importBatch.findFirst({
            where: { tenantId, id: batchId },
            select: { status: true, report: true },
          });
          if (!batch) return null;
          const active =
            batch.status === "PREVIEWED" || batch.status === "COMMITTING";
          return {
            active,
            expiresAt: previewExpiresAtFromReport(batch.report),
          };
        },
      });
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : "unknown" },
        "import preview temp cleanup failed",
      );
    }
  };

  // Startup sweep for abandoned / expired retained previews.
  await runImportTempCleanup();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "GenBioCa Compliance API listening");
  });

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  if (env.IMPORT_PREVIEW_CLEANUP_INTERVAL_MS > 0) {
    cleanupTimer = setInterval(() => {
      void runImportTempCleanup();
    }, env.IMPORT_PREVIEW_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown started");
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), env.SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

void start().catch(async () => {
  logger.fatal("application startup failed");
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
