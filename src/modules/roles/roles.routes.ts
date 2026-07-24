import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import * as controller from './roles.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requirePermission('admin.manage'), controller.create);
router.patch('/:id', requirePermission('admin.manage'), controller.update);

export default router;
