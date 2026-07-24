import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import * as controller from './permissions.controller';

// Mounted at the API root because it serves both /permissions and the
// tenant-scoped /roles/:roleId/permissions paths.
const router = Router();

router.use(authenticate);
router.get('/permissions', controller.listPermissions);
router.post('/permissions', requirePermission('admin.manage'), controller.createPermission);
router.get('/roles/:roleId/permissions', controller.listRolePermissions);
router.post('/roles/:roleId/permissions', requirePermission('admin.manage'), controller.assignPermission);
router.delete(
  '/roles/:roleId/permissions/:permissionId',
  requirePermission('admin.manage'),
  controller.removePermission,
);

export default router;
