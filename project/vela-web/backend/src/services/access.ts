import { query } from '../database/db_connection.ts';
import { invalid } from '../utils/errors.ts';
export async function classAccess(user, classId, tx = null) {
  if (user.role === 'MANAGER') return;
  const rows = user.role === 'TEACHER' ? await query('SELECT 1 AS ok FROM class_teacher WHERE class_id=@id AND teacher_id=@teacher', {
    id: classId,
    teacher: user.teacher_id
  }, tx) : await query("SELECT 1 AS ok FROM enrollment WHERE class_id=@id AND student_id=@student AND status='SUCCESS'", {
    id: classId,
    student: user.student_id
  }, tx);
  if (!rows.length) invalid('CLASS_FORBIDDEN', 'Bạn không có quyền truy cập lớp này.', 403);
}
export async function teachingAccess(user, classId, tx = null) {
  if (!['TEACHER', 'MANAGER'].includes(user.role)) invalid('FORBIDDEN', 'Chỉ giáo viên phụ trách hoặc quản lý được thao tác.', 403);
  await classAccess(user, classId, tx);
}
export async function studentAccess(user, studentId) {
  if (user.role === 'MANAGER' || user.role === 'STUDENT' && user.student_id === studentId) return;
  if (user.role === 'TEACHER' && (await query("SELECT TOP 1 1 ok FROM enrollment e JOIN class_teacher ct ON ct.class_id=e.class_id WHERE e.student_id=@id AND e.status='SUCCESS' AND ct.teacher_id=@teacher", {
    id: studentId,
    teacher: user.teacher_id
  })).length) return;
  invalid('STUDENT_FORBIDDEN', 'Không được xem học sinh này.', 403);
}
export async function audit(user, action, type, id, summary = '', tx = null) {
  await query('INSERT audit_log(actor_id,action,entity_type,entity_id,summary) VALUES(@actor,@action,@type,@id,@summary)', {
    actor: user?.account_id || null,
    action,
    type,
    id,
    summary
  }, tx);
}
