import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requireHrAccess } from '../../middleware/rbac.middleware';
import * as controller from './employees.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
// Employee create/update (incl. sensitive exit fields) is HR-only for now.
router.post('/', requireHrAccess, controller.create);
router.patch('/:id', requireHrAccess, controller.update);

export default router;
