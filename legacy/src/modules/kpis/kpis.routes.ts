import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import * as controller from './kpis.controller';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('kpi.view'), controller.list);
router.post('/', requirePermission('kpi.edit'), controller.create);
router.get('/:id', requirePermission('kpi.view'), controller.get);
router.patch('/:id', requirePermission('kpi.edit'), controller.update);

export default router;
