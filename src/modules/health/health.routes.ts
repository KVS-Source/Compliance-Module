import { Router } from 'express';
import { prisma } from '../../config/db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', service: 'GenBioCa GRC API', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable', service: 'GenBioCa GRC API', time: new Date().toISOString() });
  }
});

export default router;
