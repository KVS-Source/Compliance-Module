import { app, defaultFileStorage } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";

const start = async () => {
  await prisma.$connect();
  if (env.READINESS_STORAGE_CHECK === "true") {
    await defaultFileStorage.checkReady();
  }
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "GenBioCa Compliance API listening");
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown started");
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
