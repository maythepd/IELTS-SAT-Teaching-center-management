import { query, transaction } from '../database/db_connection.ts';
import { classAccess, teachingAccess, studentAccess } from './access.ts';
import { invalid, text, number, date, integer } from '../utils/errors.ts';
import { scoreValid } from '../utils/rules.ts';
export async function ownFile(user, id, tx = null) {
  if (!id) return null;
  id = integer(id);
  if (!(await query('SELECT file_id FROM file_asset WHERE file_id=@id AND uploaded_by=@u', {
    id,
    u: user.account_id
  }, tx)).length) invalid('FILE_FORBIDDEN', 'File không thuộc người tải lên.', 403);
  return id;
}
export function httpUrl(value) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (['http:', 'https:'].includes(u.protocol)) return u.toString();
  } catch {}
  invalid('URL_INVALID', 'Liên kết phải là HTTP hoặc HTTPS.');
}
export async function materials(user, classId) {
  await classAccess(user, classId);
  return query('SELECT m.*,f.original_name FROM course_material m LEFT JOIN file_asset f ON f.file_id=m.file_id WHERE class_id=@id ORDER BY material_id DESC', {
    id: classId
  });
}
export async function saveMaterial(user, classId, body, id = null) {
  await teachingAccess(user, classId);
  const title = text(body.title, 200);
  if (!title) invalid('TITLE_REQUIRED', 'Vui lòng nhập tên tài liệu.');
  let file = null;
  if (body.file_id) {
    const [existing] = id ? await query('SELECT file_id FROM course_material WHERE material_id=@id AND class_id=@c', {
      id,
      c: classId
    }) : [];
    file = existing?.file_id === Number(body.file_id) ? existing.file_id : await ownFile(user, body.file_id);
  }
  const url = httpUrl(body.external_url);
  if (!file && !url && !text(body.description, 10000)) invalid('CONTENT_REQUIRED', 'Cần nội dung, file hoặc link tài liệu.');
  const params = {
    id,
    c: classId,
    title,
    description: text(body.description, 10000),
    file,
    url,
    u: user.account_id
  };
  if (id) {
    const r = await query('UPDATE course_material SET title=@title,description=@description,file_id=@file,external_url=@url OUTPUT INSERTED.material_id WHERE material_id=@id AND class_id=@c', params);
    if (!r.length) invalid('MATERIAL_MISSING', 'Tài liệu không tồn tại.', 404);
  } else await query('INSERT course_material(class_id,title,description,file_id,external_url,created_by) VALUES(@c,@title,@description,@file,@url,@u)', params);
  return {
    message: 'Đã lưu tài liệu.'
  };
}
export async function assignments(user, classId) {
  await classAccess(user, classId);
  return query(`SELECT a.*,(SELECT am.material_id FROM assignment_material am WHERE am.assignment_id=a.assignment_id FOR JSON PATH) materials_json,s.submission_id,s.status submission_status,s.score,s.feedback FROM assignment a LEFT JOIN assignment_submission s ON s.assignment_id=a.assignment_id AND s.student_id=@student WHERE a.class_id=@id AND (@role<>'STUDENT' OR a.status='PUBLISHED') ORDER BY a.due_at DESC`, {
    id: classId,
    student: user.student_id || null,
    role: user.role
  });
}
export async function assignmentDetail(user, id) {
  const [a] = await query('SELECT * FROM assignment WHERE assignment_id=@id', {
    id
  });
  if (!a) invalid('ASSIGNMENT_MISSING', 'Không tìm thấy bài tập.', 404);
  await classAccess(user, a.class_id);
  if (user.role === 'STUDENT' && a.status !== 'PUBLISHED') invalid('ASSIGNMENT_HIDDEN', 'Bài tập chưa công bố.', 403);
  return { ...a, materials: await query('SELECT m.* FROM assignment_material am JOIN course_material m ON m.material_id=am.material_id WHERE am.assignment_id=@id', { id }) };
}
export async function saveAssignment(user, classId, body, id = null) {
  await teachingAccess(user, classId);
  const title = text(body.title, 200),
    due = date(body.due_at),
    max = number(body.max_score),
    metric = text(body.metric_code, 30) || 'PERCENT';
  if (!title || !['IELTS_WRITING', 'IELTS_SPEAKING', 'GENERAL'].includes(body.task_type) || max === null || max <= 0) invalid('ASSIGNMENT_INVALID', 'Kiểm tra tiêu đề, loại bài và thang điểm.');
  if (due <= new Date()) invalid('DEADLINE_INVALID', 'Hạn nộp cần ở tương lai.');
  const format = text(body.submission_format, 10) || (body.task_type === 'IELTS_SPEAKING' ? 'AUDIO' : 'ANY');
  if (!['ANY', 'TEXT', 'LINK', 'FILE', 'AUDIO'].includes(format) || body.task_type === 'IELTS_SPEAKING' && format !== 'AUDIO') invalid('SUBMISSION_FORMAT', 'Speaking cần bản ghi âm; chọn định dạng nộp bài hợp lệ.');
  if (body.material_ids != null && !Array.isArray(body.material_ids)) invalid('MATERIAL_INVALID', 'Danh sách tài liệu không hợp lệ.');
  const materialIds = body.material_ids == null ? null : [...new Set(body.material_ids.map(integer))];
  return transaction(async tx => {
    let assignmentId = id;
    const p = {
      id,
      c: classId,
      title,
      instructions: text(body.instructions, 30000),
      type: body.task_type,
      metric,
      max,
      criteria: text(body.criteria, 10000),
      due,
      u: user.account_id,
      status: body.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'
    };
    if (id) {
      const [old] = await query('SELECT task_type,submission_format FROM assignment WITH(UPDLOCK,HOLDLOCK) WHERE assignment_id=@id AND class_id=@c', { id, c: classId }, tx);
      if (old && (old.submission_format !== format || old.task_type !== body.task_type) && (await query('SELECT TOP 1 submission_id FROM assignment_submission WHERE assignment_id=@id', { id }, tx)).length) invalid('ASSIGNMENT_HAS_SUBMISSIONS', 'Bài đã có lượt nộp; không đổi loại bài hoặc định dạng nộp.', 409);
      const result = await query('UPDATE assignment SET title=@title,instructions=@instructions,task_type=@type,metric_code=@metric,max_score=@max,criteria=@criteria,due_at=@due,status=@status OUTPUT INSERTED.assignment_id WHERE assignment_id=@id AND class_id=@c', p, tx);
      if (!result.length) invalid('ASSIGNMENT_MISSING', 'Bài tập không tồn tại.', 404);
    } else {
      const [a] = await query('INSERT assignment(class_id,title,instructions,task_type,metric_code,max_score,criteria,due_at,created_by,status) OUTPUT INSERTED.assignment_id VALUES(@c,@title,@instructions,@type,@metric,@max,@criteria,@due,@u,@status)', p, tx);
      assignmentId = a.assignment_id;
    }
    await query('UPDATE assignment SET submission_format=@format WHERE assignment_id=@id', { id: assignmentId, format }, tx);
    if (materialIds !== null) {
      await query('DELETE assignment_material WHERE assignment_id=@id', { id: assignmentId }, tx);
      for (const materialId of materialIds) {
        if (!(await query('SELECT material_id FROM course_material WHERE material_id=@id AND class_id=@class', { id: materialId, class: classId }, tx)).length) invalid('MATERIAL_INVALID', 'Tài liệu phải thuộc cùng lớp.');
        await query('INSERT assignment_material(assignment_id,material_id) VALUES(@assignment,@material)', { assignment: assignmentId, material: materialId }, tx);
      }
    }
    await query(`IF EXISTS(SELECT 1 FROM schedule_event WHERE assignment_id=@id)
   UPDATE schedule_event SET title=@title,starts_at=@due,ends_at=DATEADD(minute,1,@due),reminder_at=DATEADD(hour,-24,@due),reminder_queued=0 WHERE assignment_id=@id
   ELSE INSERT schedule_event(owner_id,class_id,assignment_id,title,event_type,starts_at,ends_at,reminder_at) VALUES(@u,@c,@id,@title,'ASSIGNMENT_DEADLINE',@due,DATEADD(minute,1,@due),DATEADD(hour,-24,@due))`, {
      ...p,
      id: assignmentId
    }, tx);
    return {
      assignment_id: assignmentId
    };
  });
}
export async function submit(user, id, body) {
  const a = await assignmentDetail(user, id);
  if (!user.student_id) invalid('STUDENT_ONLY', 'Chỉ Student được nộp bài.', 403);
  const file = await ownFile(user, body.file_id),
    content = text(body.text_content, 60000),
    url = httpUrl(body.external_url);
  if (!file && !content && !url) invalid('CONTENT_REQUIRED', 'Chưa có nội dung bài nộp.');
  validateSubmissionFormat(a.submission_format, { file, content, url });
  if (a.task_type === 'IELTS_SPEAKING' || a.submission_format === 'AUDIO') {
    if (!file) invalid('RECORDING_REQUIRED', 'Bài Speaking cần file ghi âm.');
    const [asset] = await query('SELECT mime_type FROM file_asset WHERE file_id=@id', {
      id: file
    });
    if (!asset?.mime_type.startsWith('audio/') && asset?.mime_type !== 'video/webm') invalid('RECORDING_REQUIRED', 'Speaking cần định dạng âm thanh hoặc WebM.');
  }
  return transaction(async tx => {
    const [locked] = await query('SELECT * FROM assignment WITH(UPDLOCK,HOLDLOCK) WHERE assignment_id=@id', {
      id
    }, tx);
    await classAccess(user, a.class_id, tx);
    if (!locked || new Date(locked.due_at) <= new Date() || locked.status !== 'PUBLISHED') invalid('DEADLINE_PASSED', 'Đã hết hạn hoặc bài tập không còn mở.');
    if (locked.submission_format !== a.submission_format || locked.task_type !== a.task_type) invalid('ASSIGNMENT_CHANGED', 'Yêu cầu nộp bài vừa thay đổi. Tải lại bài tập.', 409);
    if ((await query('SELECT submission_id FROM assignment_submission WHERE assignment_id=@id AND student_id=@s', {
      id,
      s: user.student_id
    }, tx)).length) invalid('ALREADY_SUBMITTED', 'Bài đã được nộp.', 409);
    const [r] = await query('INSERT assignment_submission(assignment_id,student_id,text_content,external_url,file_id) OUTPUT INSERTED.submission_id VALUES(@id,@s,@content,@url,@file)', {
      id,
      s: user.student_id,
      content,
      url,
      file
    }, tx);
    return r;
  });
}
function validateSubmissionFormat(format, { file, content, url }) {
  if (format === 'TEXT' && (!content || file || url) || format === 'LINK' && (!url || file || content) || ['FILE', 'AUDIO'].includes(format) && (!file || url)) invalid('SUBMISSION_FORMAT', 'Nội dung không đúng định dạng nộp bài giáo viên yêu cầu.');
}
export async function submissions(user, id) {
  const a = await assignmentDetail(user, id);
  await teachingAccess(user, a.class_id);
  return query('SELECT s.*,a.full_name FROM assignment_submission s JOIN student st ON st.student_id=s.student_id JOIN account a ON a.account_id=st.account_id WHERE assignment_id=@id ORDER BY submitted_at', {
    id
  });
}
export async function submission(user, id) {
  const [s] = await query('SELECT s.*,a.title,a.class_id,a.metric_code,a.max_score,a.criteria FROM assignment_submission s JOIN assignment a ON a.assignment_id=s.assignment_id WHERE submission_id=@id', {
    id
  });
  if (!s) invalid('SUBMISSION_MISSING', 'Không có bài nộp.', 404);
  if (user.role === 'STUDENT') {
    if (s.student_id !== user.student_id) invalid('FORBIDDEN', 'Không được xem bài này.', 403);
  } else await teachingAccess(user, s.class_id);
  return s;
}
export async function grade(user, id, body) {
  const s = await submission(user, id);
  await teachingAccess(user, s.class_id);
  const score = number(body.score);
  if (!scoreValid(s.metric_code, score, Number(s.max_score))) invalid('SCORE_INVALID', 'Điểm ngoài thang hoặc sai bước điểm của metric.');
  await transaction(async tx => {
    await query("UPDATE assignment_submission SET score=@score,feedback=@feedback,graded_by=@u,graded_at=SYSUTCDATETIME(),status='GRADED' WHERE submission_id=@id", {
      id,
      score,
      feedback: text(body.feedback, 20000),
      u: user.account_id
    }, tx);
    await query(`IF EXISTS(SELECT 1 FROM assessment_score WHERE submission_id=@id)
  UPDATE assessment_score SET score_value=@score,max_value=@max,assessment_date=SYSUTCDATETIME(),created_by=@u WHERE submission_id=@id
  ELSE INSERT assessment_score(student_id,class_id,metric_code,score_value,max_value,assessment_date,label,submission_id,created_by) VALUES(@student,@class,@metric,@score,@max,SYSUTCDATETIME(),@label,@id,@u)`, {
      id,
      score,
      max: s.max_score,
      u: user.account_id,
      student: s.student_id,
      class: s.class_id,
      metric: s.metric_code,
      label: s.title
    }, tx);
  });
  return {
    message: 'Đã lưu điểm và feedback.'
  };
}
export async function progress(user, studentId, filters: { metric?: unknown; from?: unknown; to?: unknown } = {}) {
  await studentAccess(user, studentId);
  const metric = text(filters.metric, 30),
    from = filters.from ? date(filters.from) : new Date('2000-01-01'),
    to = filters.to ? date(filters.to) : new Date('2100-01-01');
  if (to <= from) invalid('PERIOD_INVALID', 'Ngày kết thúc phải sau ngày bắt đầu.');
  const scores = await query(`SELECT a.* FROM assessment_score a WHERE student_id=@id AND (@metric='' OR metric_code=@metric) AND assessment_date>=@from AND assessment_date<@to AND (@teacher IS NULL OR EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=a.class_id AND ct.teacher_id=@teacher)) ORDER BY assessment_date`, {
    id: studentId,
    metric,
    from,
    to,
    teacher: user.role === 'TEACHER' ? user.teacher_id : null
  });
  return {
    scores,
    targets: await query('SELECT * FROM student_target WHERE student_id=@id', {
      id: studentId
    }),
    insufficient_data: scores.length < 2
  };
}
export async function assessmentDetail(user, studentId, id) {
  await studentAccess(user, studentId);
  const [assessment] = await query('SELECT * FROM assessment_score WHERE score_id=@id AND student_id=@student', { id, student: studentId });
  if (!assessment) invalid('ASSESSMENT_MISSING', 'Không tìm thấy kết quả đánh giá.', 404);
  if (user.role === 'TEACHER') await teachingAccess(user, assessment.class_id);
  return {
    assessment,
    submission: assessment.submission_id ? await submission(user, assessment.submission_id) : null,
    answers: assessment.attempt_id ? await query('SELECT q.prompt,q.question_type,q.section_code,q.points,a.answer_text,a.file_id,a.points_awarded,a.feedback FROM test_answer a JOIN test_question q ON q.question_id=a.question_id WHERE a.attempt_id=@attempt AND q.section_code=REPLACE(@metric,\'_PERCENT\',\'\') ORDER BY q.position', { attempt: assessment.attempt_id, metric: assessment.metric_code }) : []
  };
}
export async function setTarget(user, id, body) {
  await studentAccess(user, id);
  if (user.role === 'STUDENT') invalid('FORBIDDEN', 'Giáo viên phụ trách đặt mục tiêu.', 403);
  const metric = text(body.metric_code, 30),
    value = number(body.target_value);
  const max = metric.endsWith('_PERCENT') || metric === 'PERCENT' ? 100 : metric.startsWith('IELTS_') ? 9 : metric === 'SAT_TOTAL' ? 1600 : ['SAT_MATH', 'SAT_RW'].includes(metric) ? 800 : 100;
  if (!metric || !scoreValid(metric, value, max)) invalid('TARGET_INVALID', 'Mục tiêu sai metric hoặc thang điểm.');
  await query('IF EXISTS(SELECT 1 FROM student_target WHERE student_id=@id AND metric_code=@metric) UPDATE student_target SET target_value=@value WHERE student_id=@id AND metric_code=@metric ELSE INSERT student_target(student_id,metric_code,target_value) VALUES(@id,@metric,@value)', {
    id,
    metric,
    value
  });
  return {
    message: 'Đã lưu mục tiêu.'
  };
}
