import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requestId, authenticate, csrf, errors, handle } from './middleware.ts';
import { authRouter } from './routes/auth.ts';
import { catalogRouter } from './routes/catalog.ts';
import { studentRouter } from './routes/student.ts';
import { teacherRouter } from './routes/teacher.ts';
import { managerRouter } from './routes/manager.ts';
import { webhook } from './services/payments.ts';
import * as files from './services/files.ts';
import { integer } from './utils/errors.ts';
import { query } from './database/db_connection.ts';
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(requestId);
app.use(express.json({
  limit: '2mb'
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', handle(async () => {
  await query('SELECT 1 ok');
  return {
    ready: true
  };
}));
app.post('/api/payments/webhook', async (req, res) => {
  res.json(await webhook(req.headers.authorization, req.body));
});
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api', authenticate, csrf, rateLimit({
  windowMs: 60000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Quá nhiều yêu cầu, hãy thử lại sau.'
    }
  }
}));
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/manager', managerRouter);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});
app.post('/api/files', upload.single('file'), handle(req => files.upload(req.user, req.file)));
app.get('/api/files/:id', handle(async (req, res) => {
  const f = await files.download(req.user, integer(req.params.id));
  res.type(f.mime_type);
  res.setHeader('Content-Disposition', `${f.mime_type.startsWith('audio/') || f.mime_type === 'video/webm' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.send(f.buffer);
}));
app.use((req, res) => res.status(404).json({
  ok: false,
  error: {
    code: 'NOT_FOUND',
    message: 'Không tìm thấy API.'
  }
}));
app.use(errors);
