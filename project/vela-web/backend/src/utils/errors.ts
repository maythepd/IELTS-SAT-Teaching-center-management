export class BusinessError extends Error {
  status;
  code;
  fields;
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export function invalid(code, message, status = 422) {
  throw new BusinessError(status, code, message);
}
export function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export function number(value, fallback = null) {
  const n = Number(value);
  return value !== '' && value != null && Number.isFinite(n) ? n : fallback;
}
export function integer(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) invalid('INVALID_ID', 'Mã dữ liệu không hợp lệ.');
  return n;
}
export function date(value) {
  const d = new Date(value);
  if (!value || !Number.isFinite(d.getTime())) invalid('INVALID_DATE', 'Ngày giờ không hợp lệ.');
  return d;
}
export function email(value) {
  const v = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) invalid('INVALID_EMAIL', 'Email không hợp lệ.');
  return v;
}
