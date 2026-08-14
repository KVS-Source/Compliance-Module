import { app } from './app'; import { prisma } from './config/db'; import { env } from './config/env';
const server = app.listen(env.port, () => console.log(`GenBioCa API listening on http://localhost:${env.port}`));
async function shutdown(signal: string) { console.log(`${signal} received; shutting down`); server.close(async () => { await prisma.$disconnect(); process.exit(0); }); }
process.on('SIGINT', () => void shutdown('SIGINT')); process.on('SIGTERM', () => void shutdown('SIGTERM'));
