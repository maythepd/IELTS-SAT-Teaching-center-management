import { query, transaction } from '../database/db_connection.ts';
import { invalid, text, date, number, integer } from '../utils/errors.ts';
import { classAccess, audit } from './access.ts';
export async function listCourses(user = null, search = '') {
  const params = {
    search: '%' + text(search, 120) + '%',
    teacher: user?.role === 'TEACHER' ? user.teacher_id : null
  };
  return query(`SELECT c.*,g.class_id,g.code,g.format,g.starts_at,g.ends_at,g.tuition_amount,g.status class_status,
 (SELECT TOP 1 teacher_id FROM class_teacher WHERE class_id=g.class_id ORDER BY teacher_id) teacher_id,
 CONVERT(VARCHAR(18),CAST(c.row_version AS BINARY(8)),1) version FROM course c LEFT JOIN class_group g ON g.course_id=c.course_id
 WHERE c.name LIKE @search AND (@teacher IS NULL OR c.created_by=(SELECT account_id FROM teacher WHERE teacher_id=@teacher) OR EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=g.class_id AND ct.teacher_id=@teacher))
 ORDER BY c.course_id DESC`, params);
}
export async function courseDetail(id) {
  const [c] = await query('SELECT *,CONVERT(VARCHAR(18),CAST(row_version AS BINARY(8)),1) version FROM course WHERE course_id=@id', {
    id
  });
  if (!c) invalid('COURSE_MISSING', 'Không tìm thấy khóa học.', 404);
  return {
    ...c,
    classes: await query('SELECT * FROM class_group WHERE course_id=@id', {
      id
    })
  };
}
export async function saveCourse(user, body, id = null) {
  const name = text(body.name, 200),
    program = text(body.program, 10),
    level = text(body.level, 60);
  if (!name || !['IELTS', 'SAT'].includes(program)) invalid('COURSE_INVALID', 'Kiểm tra tên khóa học và chương trình.');
  const min = number(body.target_min),
    max = number(body.target_max);
  if (min !== null && max !== null && min > max) invalid('TARGET_INVALID', 'Khoảng điểm mục tiêu không hợp lệ.');
  if ([min, max].some(n => n !== null && (n < 0 || n > (program === 'IELTS' ? 9 : 1600)))) invalid('TARGET_INVALID', 'Điểm mục tiêu ngoài thang chương trình.');
  return transaction(async tx => {
    let courseId = id;
    const p = {
      id,
      name,
      program,
      level,
      description: text(body.description, 10000),
      min,
      max,
      owner: user.account_id
    };
    if (id && !/^0x[a-f0-9]{16}$/i.test(body.version || '')) invalid('VERSION_REQUIRED', 'Tải lại form trước khi chỉnh sửa.');
    if (id) {
      const [existing] = await query('SELECT * FROM course WITH(UPDLOCK,HOLDLOCK) WHERE course_id=@id', {
        id
      }, tx);
      if (!existing) invalid('COURSE_MISSING', 'Khóa học không tồn tại.', 404);
      if (user.role === 'TEACHER' && existing.created_by !== user.account_id) invalid('FORBIDDEN', 'Chỉ được sửa course do mình tạo.', 403);
      const changed = await query(`UPDATE course SET name=@name,program=@program,level=@level,description=@description,target_min=@min,target_max=@max OUTPUT INSERTED.course_id WHERE course_id=@id AND row_version=CONVERT(BINARY(8),@version,1)`, {
        ...p,
        version: body.version || '0x00'
      }, tx);
      if (!changed.length) invalid('STALE_FORM', 'Dữ liệu đã thay đổi. Tải lại trước khi lưu.', 409);
    } else {
      const [c] = await query('INSERT course(name,program,level,description,target_min,target_max,created_by) OUTPUT INSERTED.course_id VALUES(@name,@program,@level,@description,@min,@max,@owner)', p, tx);
      courseId = c.course_id;
    }
    await audit(user, id ? 'COURSE_EDIT' : 'COURSE_CREATE', 'course', courseId, '', tx);
    return {
      course_id: courseId
    };
  });
}
export async function saveClass(user, courseId, body, id = null) {
  const code = text(body.code, 60), format = text(body.format, 15);
  const start = date(body.starts_at), end = date(body.ends_at), fee = number(body.tuition_amount);
  const teacherId = user.role === 'TEACHER' ? user.teacher_id : integer(body.teacher_id);
  if (!code || !['GROUP', 'INDIVIDUAL', 'SC'].includes(format) || end <= start || !Number.isSafeInteger(fee) || fee <= 0) invalid('CLASS_INVALID', 'Kiểm tra mã lớp, hình thức, thời gian và học phí VND nguyên dương.');
  return transaction(async tx => {
    const [course] = await query('SELECT * FROM course WITH(UPDLOCK,HOLDLOCK) WHERE course_id=@id', { id: courseId }, tx);
    if (!course) invalid('COURSE_MISSING', 'Khóa học không tồn tại.', 404);
    if (user.role === 'TEACHER' && course.created_by !== user.account_id) invalid('FORBIDDEN', 'Chỉ được quản lý lớp của khóa học do mình tạo.', 403);
    if (!(await query("SELECT t.teacher_id FROM teacher t JOIN account a ON a.account_id=t.account_id WHERE teacher_id=@id AND a.status='ACTIVE'", { id: teacherId }, tx)).length) invalid('TEACHER_INVALID', 'Giáo viên chưa hoạt động.');
    const p = { id, course: courseId, code, format, start, end, fee };
    let classId = id;
    if (id) {
      const [existing] = await query('SELECT * FROM class_group WITH(UPDLOCK,HOLDLOCK) WHERE class_id=@id AND course_id=@course', p, tx);
      if (!existing) invalid('CLASS_MISSING', 'Lớp không thuộc khóa học này.', 404);
      if ((existing.format !== format || new Date(existing.starts_at).getTime() !== start.getTime() || new Date(existing.ends_at).getTime() !== end.getTime()) && (await query('SELECT TOP 1 event_id FROM schedule_event WHERE class_id=@id', { id }, tx)).length) invalid('CLASS_HAS_SCHEDULE', 'Lớp đã có lịch; điều chỉnh từng sự kiện trước khi đổi thời gian hoặc hình thức.', 409);
      await query('UPDATE class_group SET code=@code,format=@format,starts_at=@start,ends_at=@end,tuition_amount=@fee WHERE class_id=@id', p, tx);
      // Recorded sessions keep their teacher and payroll history. Reassign future sessions explicitly.
      if ((await query('SELECT TOP 1 session_id FROM teaching_session s JOIN schedule_event e ON e.event_id=s.event_id WHERE s.class_id=@id AND s.teacher_id<>@teacher AND e.ends_at>SYSUTCDATETIME()', { id, teacher: teacherId }, tx)).length) invalid('TEACHER_HAS_SCHEDULE', 'Cần phân công lại các buổi chưa kết thúc trước khi đổi giáo viên lớp.', 409);
      await query('DELETE class_teacher WHERE class_id=@id', { id }, tx);
    } else {
      const [row] = await query('INSERT class_group(course_id,code,format,starts_at,ends_at,tuition_amount) OUTPUT INSERTED.class_id VALUES(@course,@code,@format,@start,@end,@fee)', p, tx);
      classId = row.class_id;
    }
    await query('INSERT class_teacher(class_id,teacher_id) VALUES(@id,@teacher)', { id: classId, teacher: teacherId }, tx);
    await audit(user, id ? 'CLASS_EDIT' : 'CLASS_CREATE', 'class_group', classId, '', tx);
    return { class_id: classId };
  });
}
export async function listClasses(user) {
  return query(`SELECT g.*,c.name course_name,c.program FROM class_group g JOIN course c ON c.course_id=g.course_id
 WHERE @role='MANAGER' OR (@role='TEACHER' AND EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=g.class_id AND ct.teacher_id=@teacher)) OR (@role='STUDENT' AND EXISTS(SELECT 1 FROM enrollment e WHERE e.class_id=g.class_id AND e.student_id=@student AND e.status='SUCCESS')) ORDER BY g.starts_at DESC`, {
    role: user.role,
    teacher: user.teacher_id || null,
    student: user.student_id || null
  });
}
export async function classDetail(user, id) {
  await classAccess(user, id);
  const [c] = await query('SELECT g.*,c.name course_name,c.program FROM class_group g JOIN course c ON c.course_id=g.course_id WHERE g.class_id=@id', {
    id
  });
  if (!c) invalid('CLASS_MISSING', 'Không tìm thấy lớp.', 404);
  return {
    ...c,
    students: user.role === 'STUDENT' ? [] : await query("SELECT s.student_id,a.account_id,a.full_name,a.email FROM enrollment e JOIN student s ON s.student_id=e.student_id JOIN account a ON a.account_id=s.account_id WHERE e.class_id=@id AND e.status='SUCCESS'", {
      id
    })
  };
}
