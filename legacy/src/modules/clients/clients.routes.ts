import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePlatformAdmin } from '../../middleware/rbac.middleware';
import * as controller from './clients.controller';

const router = Router();

router.use(authenticate);
router.get('/me', controller.me);
router.get('/', requirePlatformAdmin, controller.list);
router.post('/', requirePlatformAdmin, controller.create);
router.get('/:id', requirePlatformAdmin, controller.get);
router.patch('/:id', requirePlatformAdmin, controller.update);

export default router;
