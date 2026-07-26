import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { Request } from 'express';
import multer from 'multer';

import { env } from '../config/env';

// Local disk storage for development. Files are stored under uploads/<client_id>/
// with a random name; the original name and hash are kept in evidence_documents.
// TODO: add an S3 storage driver (env.storageDriver === 's3') for production.
const storage = multer.diskStorage({
  destination(req: Request, _file, cb) {
    const clientId = req.clientId ?? 'unknown';
    const dir = path.join(env.uploadDir, clientId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
});

export const uploadSingle = upload.single('file');
