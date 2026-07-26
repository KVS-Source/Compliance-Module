import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import * as authController from './auth.controller';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);

export default router;
