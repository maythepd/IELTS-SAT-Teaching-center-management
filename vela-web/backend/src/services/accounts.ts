import { query, transaction } from '../database/db_connection.ts';
import { email, text, invalid } from '../utils/errors.ts';
import { passwordHash } from '../utils/security.ts';
import { audit } from './access.ts';
export const permissionCodes = ['COURSE_WRITE', 'LEARNING_WRITE', 'GRADING_WRITE', 'TARGET_WRITE', 'SCHEDULE_WRITE', 'SESSION_WRITE', 'REPORT_WRITE', 'TEST_WRITE'];
export async function accounts() {
  return query('SELECT a.account_id,a.full_name,a.email,a.role,a.status,t.teacher_id,s.student_id FROM account a LEFT JOIN teacher t ON t.account_id=a.account_id LEFT JOIN student s ON s.account_id=a.account_id ORDER BY a.account_id DESC');
}
export async function saveAccount(user, body, id = null) {
  const name = text(body.full_name, 120),
    e = email(body.email),
    role = text(body.role, 12),
    status = text(body.status, 30);
  if (!name || !['STUDENT', 'TEACHER', 'MANAGER'].includes(role) || !['ACTIVE', 'LOCKED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL'].includes(status)) invalid('ACCOUNT_INVALID', 'Kiểm tra tên, vai trò và trạng thái.');
  return transaction(async tx => {
    let accountId = id;
    if (id) {
      const [a] = await query('SELECT * FROM account WITH(UPDLOCK,HOLDLOCK) WHERE account_id=@id', {
        id
      }, tx);
      if (!a) invalid('ACCOUNT_MISSING', 'Không có tài khoản.', 404);
      if (a.role !== role) invalid('ROLE_CHANGE_REQUIRES_MIGRATION', 'Để giữ lịch sử, không đổi role hồ sơ đã tạo; dùng quyền riêng hoặc tài khoản khác.');
      if (id === user.account_id && status !== 'ACTIVE') invalid('SELF_LOCK', 'Không tự khóa tài khoản đang dùng.');
      await query('UPDATE account SET full_name=@name,email=@e,status=@status WHERE account_id=@id', {
        id,
        name,
        e,
        status
      }, tx);
      if (status !== 'ACTIVE') await query('DELETE login_session WHERE account_id=@id', {
        id
      }, tx);
    } else {
      if (typeof body.password !== 'string' || body.password.length < 10) invalid('PASSWORD_REQUIRED', 'Mật khẩu khởi tạo cần ít nhất 10 ký tự.');
      const [a] = await query('INSERT account(email,full_name,password_hash,role,status) OUTPUT INSERTED.account_id VALUES(@e,@name,@p,@role,@status)', {
        e,
        name,
        p: passwordHash(body.password),
        role,
        status
      }, tx);
      accountId = a.account_id;
      if (role === 'STUDENT') await query('INSERT student(account_id) VALUES(@id)', {
        id: accountId
      }, tx);
      if (role === 'TEACHER') await query('INSERT teacher(account_id) VALUES(@id)', {
        id: accountId
      }, tx);
    }
    await audit(user, id ? 'ACCOUNT_EDIT' : 'ACCOUNT_CREATE', 'account', accountId, '', tx);
    return {
      account_id: accountId
    };
  });
}
export async function setPermissions(user, id, body) {
  if (!Array.isArray(body.permissions)) invalid('PERMISSION_INVALID', 'Cần danh sách quyền.');
  await transaction(async tx => {
    await query('DELETE account_permission WHERE account_id=@id', {
      id
    }, tx);
    for (const p of body.permissions) {
      if (!permissionCodes.includes(p.code) || typeof p.allowed !== 'boolean') invalid('PERMISSION_INVALID', 'Quyền không hợp lệ.');
      await query('INSERT account_permission(account_id,permission_code,allowed) VALUES(@id,@code,@allowed)', {
        id,
        code: p.code,
        allowed: p.allowed
      }, tx);
    }
    await audit(user, 'PERMISSION_EDIT', 'account', id, '', tx);
  });
  return {
    message: 'Đã cập nhật quyền.'
  };
}
export async function permission(user, code) {
  const [override] = await query('SELECT allowed FROM account_permission WHERE account_id=@id AND permission_code=@code', {
    id: user.account_id,
    code
  });
  if (override && !override.allowed) invalid('PERMISSION_DENIED', 'Tài khoản đã bị thu hồi quyền thao tác này.', 403);
}
