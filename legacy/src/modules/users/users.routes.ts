import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperuser } from '../../middleware/rbac.middleware';
import * as controller from './users.controller';

const router = Router();

router.use(authenticate);
router.get('/me', controller.me);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requireSuperuser, controller.create);
router.patch('/:id', requireSuperuser, controller.update);

export default router;
