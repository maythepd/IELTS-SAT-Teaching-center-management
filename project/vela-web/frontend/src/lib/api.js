let csrf = '';
export function setSession(user) {
  csrf = user?.csrf_token || '';
}
export async function api(path, options = {}) {
  const headers = {
    ...options.headers
  };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD'].includes(options.method || 'GET') && csrf) headers['X-CSRF-Token'] = csrf;
  let response;
  try {
    response = await fetch('/api' + path, {
      ...options,
      body,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
  } catch {
    throw new Error('Không kết nối được API. Kiểm tra backend và thử lại.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`API trả phản hồi không hợp lệ (${response.status}).`);
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error((payload.error?.message || 'Không xử lý được yêu cầu.') + (payload.requestId ? ` [${payload.requestId}]` : ''));
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload.data === undefined ? payload : payload.data;
}
export function notice(message) {
  window.dispatchEvent(new CustomEvent('app-notice', {
    detail: message
  }));
}
export const money = value => value == null ? 'Chưa có' : new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND'
}).format(Number(value));
export const when = value => value ? new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh'
}) : '—';
export function localInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
