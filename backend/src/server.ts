import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "GenBioCa Compliance API listening");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "graceful shutdown started");
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
