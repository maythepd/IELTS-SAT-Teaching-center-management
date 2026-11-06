import { query, transaction } from '../database/db_connection.ts';
import { invalid, text, date, integer, number } from '../utils/errors.ts';
import { classAccess, teachingAccess, audit } from './access.ts';
import { queueMail } from './mail.ts';
export async function events(user, filters: { from?: unknown; to?: unknown } = {}) {
  const from = filters.from ? date(filters.from) : new Date(Date.now() - 30 * 86400000),
    to = filters.to ? date(filters.to) : new Date(Date.now() + 90 * 86400000);
  return query(`SELECT e.*,CASE WHEN @role='STUDENT' THEN N'[]' ELSE (SELECT p.account_id FROM event_participant p WHERE p.event_id=e.event_id FOR JSON PATH) END participants_json,CONVERT(VARCHAR(18),CAST(e.row_version AS BINARY(8)),1) version,s.session_id,s.approval_status,s.recorded_at FROM schedule_event e LEFT JOIN teaching_session s ON s.event_id=e.event_id WHERE e.starts_at>=@from AND e.starts_at<@to AND
 (@role='MANAGER' OR e.owner_id=@owner OR EXISTS(SELECT 1 FROM event_participant p WHERE p.event_id=e.event_id AND p.account_id=@owner) OR (@role='TEACHER' AND EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=e.class_id AND ct.teacher_id=@teacher)) OR (@role='STUDENT' AND EXISTS(SELECT 1 FROM enrollment n WHERE n.class_id=e.class_id AND n.student_id=@student AND n.status='SUCCESS' AND NOT EXISTS(SELECT 1 FROM event_participant ep WHERE ep.event_id=e.event_id)))) ORDER BY e.starts_at`, {
    from,
    to,
    role: user.role,
    owner: user.account_id,
    teacher: user.teacher_id || null,
    student: user.student_id || null
  });
}
export async function saveEvent(user, body, id = null) {
  const title = text(body.title, 200),
    start = date(body.starts_at),
    end = date(body.ends_at),
    type = text(body.event_type, 30),
    classId = body.class_id ? integer(body.class_id) : null;
  if (!title || end <= start || !['LESSON', 'MOCK_TEST', 'OFFICIAL_EXAM', 'PERSONAL'].includes(type)) invalid('EVENT_INVALID', 'Kiểm tra tên, loại và giờ sự kiện.');
  if (classId) await teachingAccess(user, classId);
  if (type === 'LESSON' && !classId) invalid('CLASS_REQUIRED', 'Buổi dạy cần có lớp.');
  const ids = Array.isArray(body.participant_ids) ? [...new Set(body.participant_ids.map(integer))] : [];
  return transaction(async tx => {
    if (id) {
      const [old] = await query('SELECT * FROM schedule_event WITH(UPDLOCK,HOLDLOCK) WHERE event_id=@id', {
        id
      }, tx);
      if (!old) invalid('EVENT_MISSING', 'Không có sự kiện.', 404);
      if (old.owner_id !== user.account_id) invalid('NOT_EVENT_OWNER', 'Chỉ người tạo được sửa lịch.', 403);
      if (old.assignment_id) invalid('ASSIGNMENT_EVENT', 'Hãy sửa deadline từ bài tập.');
      if ((await query('SELECT session_id FROM teaching_session WHERE event_id=@id AND recorded_at IS NOT NULL', {
        id
      }, tx)).length) invalid('SESSION_RECORDED', 'Không sửa lịch của buổi đã ghi nhận.');
    }
    const [overlap] = await query(`SELECT TOP 1 event_id FROM schedule_event WITH(UPDLOCK,HOLDLOCK) WHERE event_id<>COALESCE(@id,0) AND event_type='LESSON' AND @type='LESSON' AND starts_at<@end AND ends_at>@start AND (@class IS NOT NULL AND class_id=@class)`, {
      id,
      type,
      start,
      end,
      u: user.account_id,
      class: classId
    }, tx);
    if (overlap) invalid('SCHEDULE_CONFLICT', 'Lịch dạy trùng với lịch hiện có.', 409);
    let eventId = id;
    const reminder = body.reminder_at ? date(body.reminder_at) : new Date(start.getTime() - 3600000);
    if (reminder > start) invalid('REMINDER_INVALID', 'Nhắc lịch phải trước khi bắt đầu.');
    const p = {
      id,
      title,
      start,
      end,
      type,
      c: classId,
      u: user.account_id,
      reminder,
      details: text(body.details, 10000)
    };
    if (id) {
      const r = await query('UPDATE schedule_event SET title=@title,details=@details,starts_at=@start,ends_at=@end,event_type=@type,class_id=@c,reminder_at=@reminder,reminder_queued=0 OUTPUT INSERTED.event_id WHERE event_id=@id AND row_version=CONVERT(BINARY(8),@version,1)', {
        ...p,
        version: body.version || '0x00'
      }, tx);
      if (!r.length) invalid('STALE_FORM', 'Lịch đã thay đổi. Vui lòng tải lại.', 409);
    } else {
      const [e] = await query('INSERT schedule_event(owner_id,class_id,title,details,event_type,starts_at,ends_at,reminder_at) OUTPUT INSERTED.event_id VALUES(@u,@c,@title,@details,@type,@start,@end,@reminder)', p, tx);
      eventId = e.event_id;
    }
    await query('DELETE event_participant WHERE event_id=@id', {
      id: eventId
    }, tx);
    for (const accountId of ids) {
      const [a] = await query(`SELECT a.account_id FROM account a LEFT JOIN student s ON s.account_id=a.account_id WHERE a.account_id=@id AND a.status='ACTIVE' AND (@manager=1 OR (@class IS NOT NULL AND EXISTS(SELECT 1 FROM enrollment n WHERE n.class_id=@class AND n.student_id=s.student_id AND n.status='SUCCESS')))`, {
        id: accountId,
        manager: user.role === 'MANAGER',
        class: classId
      }, tx);
      if (!a) invalid('PARTICIPANT_INVALID', 'Người tham gia không thuộc lớp hoặc không hợp lệ.');
      await query('INSERT event_participant(event_id,account_id) VALUES(@e,@a)', {
        e: eventId,
        a: accountId
      }, tx);
    }
    if (type === 'LESSON') {
      const teacherId = user.role === 'TEACHER' ? user.teacher_id : integer(body.teacher_id);
      if (!(await query('SELECT 1 ok FROM class_teacher WHERE class_id=@c AND teacher_id=@t', {
        c: classId,
        t: teacherId
      }, tx)).length) invalid('TEACHER_INVALID', 'Giáo viên chưa được phân công lớp.');
      const [conflict] = await query('SELECT TOP 1 s.session_id FROM teaching_session s JOIN schedule_event e ON e.event_id=s.event_id WHERE s.teacher_id=@t AND e.event_id<>@id AND e.starts_at<@end AND e.ends_at>@start', {
        t: teacherId,
        id: eventId,
        start,
        end
      }, tx);
      if (conflict) invalid('SCHEDULE_CONFLICT', 'Giáo viên có buổi dạy khác cùng giờ.', 409);
      await query('IF EXISTS(SELECT 1 FROM teaching_session WHERE event_id=@e) UPDATE teaching_session SET class_id=@c,teacher_id=@t WHERE event_id=@e ELSE INSERT teaching_session(event_id,class_id,teacher_id) VALUES(@e,@c,@t)', {
        e: eventId,
        c: classId,
        t: teacherId
      }, tx);
    } else await query('DELETE teaching_session WHERE event_id=@e AND recorded_at IS NULL', {
      e: eventId
    }, tx);
    return {
      event_id: eventId
    };
  });
}
export async function session(user, id) {
  const [s] = await query('SELECT s.*,e.title,e.starts_at,e.ends_at,g.code FROM teaching_session s JOIN schedule_event e ON e.event_id=s.event_id JOIN class_group g ON g.class_id=s.class_id WHERE session_id=@id', {
    id
  });
  if (!s) invalid('SESSION_MISSING', 'Không tìm thấy buổi dạy.', 404);
  await teachingAccess(user, s.class_id);
  if (user.role === 'TEACHER' && s.teacher_id !== user.teacher_id) invalid('SESSION_FORBIDDEN', 'Bạn không phụ trách buổi này.', 403);
  return {
    ...s,
    students: await query("SELECT st.student_id,a.full_name,att.status,att.notes,r.report_id FROM enrollment n JOIN student st ON st.student_id=n.student_id JOIN account a ON a.account_id=st.account_id LEFT JOIN attendance att ON att.student_id=st.student_id AND att.session_id=@id LEFT JOIN post_class_report r ON r.student_id=st.student_id AND r.session_id=@id WHERE n.class_id=@c AND n.status='SUCCESS' AND n.success_at<=@end ORDER BY a.full_name", {
      id,
      c: s.class_id,
      end: s.ends_at
    })
  };
}
export async function recordSession(user, id, body) {
  const s = await session(user, id),
    duration = number(body.duration_minutes);
  if (s.approval_status === 'APPROVED') invalid('SESSION_APPROVED', 'Buổi đã duyệt; cần quản lý xử lý điều chỉnh.');
  if (new Date(s.starts_at) > new Date()) invalid('SESSION_FUTURE', 'Chưa thể ghi nhận buổi dạy tương lai.');
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) invalid('DURATION_INVALID', 'Thời lượng cần từ 1 đến 1440 phút.');
  const rows = body.attendance;
  if (!Array.isArray(rows) || rows.length !== s.students.length) invalid('ATTENDANCE_REQUIRED', 'Cần điểm danh đầy đủ roster.');
  const roster = new Set(s.students.map(x => x.student_id)),
    seen = new Set();
  for (const r of rows) {
    const student = integer(r.student_id);
    if (!roster.has(student) || seen.has(student) || !['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(r.status)) invalid('ATTENDANCE_INVALID', 'Danh sách điểm danh không hợp lệ.');
    seen.add(student);
  }
  await transaction(async tx => {
    const [locked] = await query('SELECT * FROM teaching_session WITH(UPDLOCK,HOLDLOCK) WHERE session_id=@id', {
      id
    }, tx);
    if (locked.approval_status === 'APPROVED') invalid('SESSION_APPROVED', 'Buổi vừa được duyệt. Hãy tải lại.', 409);
    for (const r of rows) await query('IF EXISTS(SELECT 1 FROM attendance WHERE session_id=@id AND student_id=@s) UPDATE attendance SET status=@status,notes=@notes WHERE session_id=@id AND student_id=@s ELSE INSERT attendance(session_id,student_id,status,notes) VALUES(@id,@s,@status,@notes)', {
      id,
      s: r.student_id,
      status: r.status,
      notes: text(r.notes, 1000)
    }, tx);
    await query("UPDATE teaching_session SET duration_minutes=@duration,recorded_at=SYSUTCDATETIME(),approval_status='PENDING' WHERE session_id=@id", {
      id,
      duration
    }, tx);
    await audit(user, 'SESSION_RECORD', 'teaching_session', id, '', tx);
  });
  return {
    message: 'Đã ghi nhận; buổi dạy đang chờ duyệt.'
  };
}
export async function report(user, id, studentId, body = null) {
  const s = await session(user, id);
  if (!s.recorded_at) invalid('SESSION_UNRECORDED', 'Cần ghi nhận buổi dạy trước.');
  if (!s.students.some(x => x.student_id === studentId)) invalid('STUDENT_INVALID', 'Học sinh không thuộc roster.');
  if (!body) return (await query('SELECT * FROM post_class_report WHERE session_id=@id AND student_id=@s', {
    id,
    s: studentId
  }))[0] || {};
  const remarks = text(body.remarks, 15000);
  if (!remarks) invalid('REMARKS_REQUIRED', 'Cần nhận xét sau buổi học.');
  return transaction(async tx => {
    const p = {
      id,
      s: studentId,
      u: user.account_id,
      participation: text(body.participation, 1000),
      remarks,
      recommendations: text(body.recommendations, 10000)
    };
    let [r] = await query('SELECT * FROM post_class_report WITH(UPDLOCK,HOLDLOCK) WHERE session_id=@id AND student_id=@s', p, tx);
    if (r) {
      const same = r.participation === p.participation && r.remarks === p.remarks && r.recommendations === p.recommendations;
      if (same) return {
        report_id: r.report_id,
        message: 'Báo cáo không thay đổi; không gửi trùng email.'
      };
      [r] = await query('UPDATE post_class_report SET participation=@participation,remarks=@remarks,recommendations=@recommendations,report_version=report_version+1,submitted_by=@u,submitted_at=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE session_id=@id AND student_id=@s', p, tx);
    } else [r] = await query('INSERT post_class_report(session_id,student_id,participation,remarks,recommendations,submitted_by) OUTPUT INSERTED.* VALUES(@id,@s,@participation,@remarks,@recommendations,@u)', p, tx);
    const student = s.students.find(x => x.student_id === studentId),
      scores = await query('SELECT TOP 5 metric_code,score_value,max_value,label FROM assessment_score WHERE student_id=@s AND class_id=@c AND assessment_date BETWEEN @start AND @end ORDER BY assessment_date DESC', {
        s: studentId,
        c: s.class_id,
        start: s.starts_at,
        end: s.ends_at
      }, tx);
    const parents = await query('SELECT * FROM parent_contact WHERE student_id=@s AND consent=1', {
      s: studentId
    }, tx);
    for (const parent of parents) await queueMail(parent.email, `Trung tâm học tập — Báo cáo ${student.full_name}`, `Buổi: ${s.title}\nĐiểm danh: ${student.status || 'Chưa ghi nhận'}\nTham gia: ${p.participation}\nNhận xét: ${remarks}\nKhuyến nghị: ${p.recommendations}\nKết quả ghi nhận trong buổi: ${scores.map(x => `${x.metric_code}: ${x.score_value}/${x.max_value}`).join('; ') || 'Chưa có'}`, `report:${r.report_id}:${r.report_version}:${parent.parent_id}`, 'REPORT', parent.parent_id, tx);
    return {
      report_id: r.report_id,
      message: parents.length ? 'Đã lưu báo cáo; email đang chờ gửi.' : 'Đã lưu báo cáo. Chưa có phụ huynh đồng ý nhận email.'
    };
  });
}
