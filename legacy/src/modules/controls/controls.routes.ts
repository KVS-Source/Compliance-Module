import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePlatformAdmin } from '../../middleware/rbac.middleware';
import * as controller from './controls.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requirePlatformAdmin, controller.create);
router.patch('/:id', requirePlatformAdmin, controller.update);

export default router;
