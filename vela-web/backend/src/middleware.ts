import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { currentUser } from './services/auth.ts';
import { BusinessError } from './utils/errors.ts';
export function requestId(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
export function cookie(req, name) {
  const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}
export async function authenticate(req, res, next) {
  req.user = await currentUser(cookie(req, 'app_session'), req.path !== '/logout');
  if (!req.user) return res.status(401).json({
    ok: false,
    error: {
      code: 'LOGIN_REQUIRED',
      message: 'Vui lòng đăng nhập.'
    }
  });
  next();
}
export function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thao tác.'
      }
    });
    next();
  };
}
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers.origin && req.headers.origin !== new URL(config.appUrl).origin) return res.status(403).json({
    ok: false,
    error: {
      code: 'ORIGIN',
      message: 'Nguồn yêu cầu không hợp lệ.'
    }
  });
  if (req.headers['x-csrf-token'] !== req.user.csrf_token) return res.status(403).json({
    ok: false,
    error: {
      code: 'CSRF',
      message: 'Phiên form đã hết hạn, vui lòng tải lại trang.'
    }
  });
  next();
}
export function authOrigin(req, res, next) {
  if (req.headers.origin && req.headers.origin !== new URL(config.appUrl).origin) return res.status(403).json({
    ok: false,
    error: {
      message: 'Nguồn yêu cầu không hợp lệ.'
    }
  });
  next();
}
export function errors(error, req, res, next) {
  if (res.headersSent) return next(error);
  const known = error instanceof BusinessError;
  const duplicate = [2601, 2627].includes(error.number);
  const badJson = error.type === 'entity.parse.failed';
  const status = known ? error.status : badJson ? 400 : duplicate || error.number === 1205 ? 409 : error.code === 'LIMIT_FILE_SIZE' ? 413 : ['ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ELOGIN', 'ENOTOPEN'].includes(error.code) ? 503 : 500;
  if (!known) console.error(JSON.stringify({
    level: 'error',
    requestId: req.requestId,
    route: req.path,
    code: error.code || 'UNEXPECTED',
    name: error.name,
    number: error.number,
    location: String(error.stack || '').split('\n').find(line => line.trim().startsWith('at '))
  }));
  res.status(status).json({
    ok: false,
    error: {
      code: known ? error.code : badJson ? 'INVALID_JSON' : duplicate ? 'CONFLICT' : status === 413 ? 'FILE_TOO_LARGE' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
      message: known ? error.message : badJson ? 'Nội dung JSON không hợp lệ.' : duplicate ? 'Bản ghi đã tồn tại hoặc vừa được cập nhật.' : status === 413 ? 'File vượt giới hạn 10 MB.' : status === 503 ? 'Dịch vụ tạm thời chưa sẵn sàng. Hãy thử lại.' : 'Không thể xử lý yêu cầu. Vui lòng cung cấp requestId để kiểm tra.',
      fieldErrors: known ? error.fields : {}
    },
    requestId: req.requestId
  });
}
export const handle = work => async (req, res) => {
  const value = await work(req, res);
  if (!res.headersSent) res.json({
    ok: true,
    data: value
  });
};
