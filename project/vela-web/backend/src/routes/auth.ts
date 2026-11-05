import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../services/auth.ts';
import { query } from '../database/db_connection.ts';
import { hash } from '../utils/security.ts';
import { authenticate, csrf, authOrigin, cookie, handle } from '../middleware.ts';
import { config } from '../config.ts';
export const authRouter = Router();
authRouter.use(authOrigin);
authRouter.use(['/login', '/login/verify', '/register', '/forgot-password', '/reset-password'], rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Quá nhiều yêu cầu. Thử lại sau.'
    }
  }
}));
function session(res, value) {
  if (value.sessionToken) {
    res.cookie('app_session', value.sessionToken, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 3600000
    });
    delete value.sessionToken;
  }
  return value;
}
authRouter.post('/register', handle(req => auth.register(req.body)));
authRouter.post('/verify-email', handle(req => auth.verify(req.body.token)));
authRouter.post('/login', handle(async (req, res) => session(res, await auth.login(req.body))));
authRouter.post('/login/verify', handle(async (req, res) => session(res, await auth.finishLogin(req.body))));
authRouter.post('/forgot-password', handle(req => auth.forgot(req.body)));
authRouter.post('/reset-password', handle(req => auth.reset(req.body)));
authRouter.get('/me', authenticate, handle(req => req.user));
authRouter.use(authenticate, csrf);
authRouter.get('/profile', handle(req => auth.profile(req.user)));
authRouter.patch('/profile', handle(req => auth.profile(req.user, req.body)));
authRouter.post('/parent-contact', handle(req => auth.parentContact(req.user, req.body)));
authRouter.post('/logout', handle(async (req, res) => {
  await query('DELETE login_session WHERE token_hash=@hash', {
    hash: hash(cookie(req, 'app_session'))
  });
  res.clearCookie('app_session', {
    path: '/',
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax'
  });
  return {
    message: 'Đã đăng xuất.'
  };
}));
