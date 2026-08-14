import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePlatformAdmin } from '../../middleware/rbac.middleware';
import * as controller from './frameworks.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
// The framework catalog is global; only platform admins may change it.
router.post('/', requirePlatformAdmin, controller.create);
router.patch('/:id', requirePlatformAdmin, controller.update);

export default router;
