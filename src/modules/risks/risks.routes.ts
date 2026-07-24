import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import * as controller from './risks.controller';

const router = Router();

router.use(authenticate);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);

export default router;
