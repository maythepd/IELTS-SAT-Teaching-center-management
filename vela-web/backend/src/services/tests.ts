import { query, transaction } from '../database/db_connection.ts';
import { classAccess, teachingAccess } from './access.ts';
import { ownFile, httpUrl } from './learning.ts';
import { invalid, text, integer, number } from '../utils/errors.ts';
import { scoreValid } from '../utils/rules.ts';
export async function testList(user, classId = null) {
  if (classId) await classAccess(user, classId);
  return query(`SELECT t.*,g.code class_code FROM practice_test t JOIN class_group g ON g.class_id=t.class_id WHERE (@class IS NULL OR t.class_id=@class) AND (@role='MANAGER' OR (@role='TEACHER' AND EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=t.class_id AND ct.teacher_id=@teacher)) OR (@role='STUDENT' AND t.status='PUBLISHED' AND EXISTS(SELECT 1 FROM enrollment e WHERE e.class_id=t.class_id AND e.student_id=@student AND e.status='SUCCESS'))) ORDER BY test_id DESC`, {
    class: classId,
    role: user.role,
    teacher: user.teacher_id || null,
    student: user.student_id || null
  });
}
export async function testDetail(user, id, includeQuestions = false) {
  const [t] = await query('SELECT * FROM practice_test WHERE test_id=@id', {
    id
  });
  if (!t) invalid('TEST_MISSING', 'Không tìm thấy bài thi.', 404);
  await classAccess(user, t.class_id);
  if (user.role === 'STUDENT' && t.status !== 'PUBLISHED') invalid('TEST_HIDDEN', 'Bài thi chưa được công bố.', 403);
  const questions = await query('SELECT * FROM test_question WHERE test_id=@id ORDER BY position', {
    id
  });
  return {
    ...t,
    questions: (user.role === 'STUDENT' && !includeQuestions ? [] : questions).map(q => user.role === 'STUDENT' ? Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'answer_key')) : q),
    scales: user.role === 'STUDENT' ? [] : await query('SELECT * FROM test_scale WHERE test_id=@id', {
      id
    })
  };
}
export async function saveTest(user, classId, body, id = null) {
  await teachingAccess(user, classId);
  const title = text(body.title, 200),
    duration = number(body.duration_minutes),
    questions = body.questions;
  if (!title || !Number.isInteger(duration) || duration < 1 || duration > 600 || !['IELTS', 'SAT'].includes(body.program) || !Array.isArray(questions) || !questions.length || questions.length > 300) invalid('TEST_INVALID', 'Cần tên đề, thời lượng 1–600 phút và danh sách câu hỏi.');
  const parsed = questions.map((q, i) => {
    const type = text(q.question_type, 15),
      points = number(q.points),
      prompt = text(q.prompt, 30000),
      section = text(q.section_code, 30);
    if (!['MCQ', 'SHORT', 'WRITING', 'SPEAKING'].includes(type) || !prompt || !section || points === null || points <= 0) invalid('QUESTION_INVALID', `Câu ${i + 1} không hợp lệ.`);
    if (type === 'MCQ' && (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8 || !q.options.map((_, i) => String.fromCharCode(65 + i)).includes(String(q.answer_key)))) invalid('OPTIONS_INVALID', `Câu ${i + 1}: cần đáp án A/B/C... và ít nhất hai lựa chọn.`);
    if (type === 'SHORT' && !text(q.answer_key, 2000)) invalid('ANSWER_REQUIRED', `Câu ${i + 1}: thiếu đáp án.`);
    return {
      ...q,
      position: i + 1,
      type,
      points,
      prompt,
      section,
      media: httpUrl(q.media_url)
    };
  });
  return transaction(async tx => {
    let testId = id;
    if (id) {
      const [t] = await query('SELECT * FROM practice_test WITH(UPDLOCK,HOLDLOCK) WHERE test_id=@id AND class_id=@c', {
        id,
        c: classId
      }, tx);
      if (!t) invalid('TEST_MISSING', 'Đề không tồn tại.', 404);
      if ((await query('SELECT TOP 1 attempt_id FROM test_attempt WHERE test_id=@id', {
        id
      }, tx)).length) invalid('TEST_HAS_ATTEMPTS', 'Đề đã có lượt làm; hãy tạo đề mới để giữ lịch sử.');
      await query('DELETE test_scale WHERE test_id=@id; DELETE test_question WHERE test_id=@id', {
        id
      }, tx);
      await query('UPDATE practice_test SET title=@title,description=@description,program=@program,duration_minutes=@duration,status=@status WHERE test_id=@id', {
        id,
        title,
        description: text(body.description, 10000),
        program: body.program,
        duration,
        status: body.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'
      }, tx);
    } else {
      const [t] = await query('INSERT practice_test(class_id,title,description,program,duration_minutes,status,created_by) OUTPUT INSERTED.test_id VALUES(@c,@title,@description,@program,@duration,@status,@u)', {
        c: classId,
        title,
        description: text(body.description, 10000),
        program: body.program,
        duration,
        status: body.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
        u: user.account_id
      }, tx);
      testId = t.test_id;
    }
    for (const q of parsed) await query('INSERT test_question(test_id,position,section_code,question_type,prompt,options_json,answer_key,points,media_url) VALUES(@t,@p,@s,@type,@prompt,@options,@key,@points,@media)', {
      t: testId,
      p: q.position,
      s: q.section,
      type: q.type,
      prompt: q.prompt,
      options: Array.isArray(q.options) ? JSON.stringify(q.options) : null,
      key: ['MCQ', 'SHORT'].includes(q.type) ? String(q.answer_key) : null,
      points: q.points,
      media: q.media
    }, tx);
    for (const scale of body.scales || []) {
      const raw = number(scale.raw_points),
        score = number(scale.scaled_score),
        max = number(scale.max_score),
        section = text(scale.section_code, 30);
      if (raw === null || raw < 0 || !parsed.some(q => q.section === section) || !scoreValid(section, score, max)) invalid('SCALE_INVALID', 'Bảng quy đổi điểm không hợp lệ.');
      await query('INSERT test_scale(test_id,section_code,raw_points,scaled_score,max_score) VALUES(@id,@section,@raw,@score,@max)', {
        id: testId,
        section,
        raw,
        score,
        max
      }, tx);
    }
    return {
      test_id: testId
    };
  });
}
async function attemptAccess(user, id, tx = null) {
  const [a] = await query('SELECT a.*,t.class_id,t.title FROM test_attempt a JOIN practice_test t ON t.test_id=a.test_id WHERE attempt_id=@id', {
    id
  }, tx);
  if (!a) invalid('ATTEMPT_MISSING', 'Không tìm thấy lượt thi.', 404);
  if (user.role === 'STUDENT') {
    if (a.student_id !== user.student_id) invalid('FORBIDDEN', 'Không được xem lượt thi này.', 403);
  } else await teachingAccess(user, a.class_id, tx);
  return a;
}
export async function startTest(user, id) {
  const t = await testDetail(user, id);
  if (!user.student_id) invalid('STUDENT_ONLY', 'Chỉ Student được làm bài.', 403);
  return transaction(async tx => {
    await query('SELECT test_id FROM practice_test WITH(UPDLOCK,HOLDLOCK) WHERE test_id=@id', {
      id
    }, tx);
    const [existing] = await query("SELECT * FROM test_attempt WHERE test_id=@id AND student_id=@s AND status='IN_PROGRESS'", {
      id,
      s: user.student_id
    }, tx);
    if (existing) return existing;
    const [a] = await query('INSERT test_attempt(test_id,student_id,deadline_at) OUTPUT INSERTED.* VALUES(@id,@s,DATEADD(minute,@minutes,SYSUTCDATETIME()))', {
      id,
      s: user.student_id,
      minutes: t.duration_minutes
    }, tx);
    return a;
  });
}
export async function attempt(user, id) {
  const a = await attemptAccess(user, id),
    test = await testDetail(user, a.test_id, true),
    answers = await query('SELECT * FROM test_answer WHERE attempt_id=@id', {
      id
    });
  return {
    ...a,
    server_time: new Date().toISOString(),
    test,
    answers: answers.map(x => user.role === 'STUDENT' && a.status !== 'GRADED' ? {
      question_id: x.question_id,
      answer_text: x.answer_text,
      file_id: x.file_id
    } : x)
  };
}
export async function saveAnswers(user, id, body) {
  if (user.role !== 'STUDENT') invalid('STUDENT_ONLY', 'Chỉ Student được gửi đáp án.', 403);
  const a = await attemptAccess(user, id);
  if (!Array.isArray(body.answers) || body.answers.length > 300) invalid('ANSWERS_INVALID', 'Danh sách đáp án không hợp lệ.');
  const files = {};
  for (const r of body.answers) if (r.file_id) files[r.question_id] = await ownFile(user, r.file_id);
  await transaction(async tx => {
    const [locked] = await query('SELECT * FROM test_attempt WITH(UPDLOCK,HOLDLOCK) WHERE attempt_id=@id', {
      id
    }, tx);
    if (locked.status !== 'IN_PROGRESS' || new Date(locked.deadline_at) <= new Date()) invalid('TEST_ENDED', 'Bài thi đã kết thúc.', 409);
    const questions = await query('SELECT question_id FROM test_question WHERE test_id=@id', {
        id: a.test_id
      }, tx),
      allowed = new Set(questions.map(q => q.question_id));
    for (const r of body.answers) {
      const q = integer(r.question_id);
      if (!allowed.has(q)) invalid('QUESTION_INVALID', 'Câu hỏi không thuộc đề.');
      await query('IF EXISTS(SELECT 1 FROM test_answer WHERE attempt_id=@id AND question_id=@q) UPDATE test_answer SET answer_text=@text,file_id=@file WHERE attempt_id=@id AND question_id=@q ELSE INSERT test_answer(attempt_id,question_id,answer_text,file_id) VALUES(@id,@q,@text,@file)', {
        id,
        q,
        text: text(r.answer_text, 30000),
        file: files[q] || null
      }, tx);
    }
  });
  return {
    message: 'Đã lưu đáp án.'
  };
}
export async function submitTest(user, id) {
  const a = await attemptAccess(user, id);
  if (user.role !== 'STUDENT') invalid('STUDENT_ONLY', 'Chỉ Student được nộp lượt thi.', 403);
  return transaction(async tx => {
    const [locked] = await query('SELECT * FROM test_attempt WITH(UPDLOCK,HOLDLOCK) WHERE attempt_id=@id', {
      id
    }, tx);
    if (locked.status !== 'IN_PROGRESS') return {
      message: 'Lượt thi đã được nộp.'
    };
    const qs = await query('SELECT q.*,a.answer_text,a.file_id FROM test_question q LEFT JOIN test_answer a ON a.question_id=q.question_id AND a.attempt_id=@attempt WHERE q.test_id=@test', {
      attempt: id,
      test: a.test_id
    }, tx);
    for (const q of qs) {
      let awarded = null;
      if (['MCQ', 'SHORT'].includes(q.question_type)) {
        const norm = s => String(s || '').trim().toLocaleLowerCase('vi');
        awarded = norm(q.answer_text) === norm(q.answer_key) ? Number(q.points) : 0;
      } else if (!q.answer_text && !q.file_id) awarded = 0;
      await query('IF EXISTS(SELECT 1 FROM test_answer WHERE attempt_id=@id AND question_id=@q) UPDATE test_answer SET points_awarded=@points WHERE attempt_id=@id AND question_id=@q ELSE INSERT test_answer(attempt_id,question_id,points_awarded) VALUES(@id,@q,@points)', {
        id,
        q: q.question_id,
        points: awarded
      }, tx);
    }
    await query("UPDATE test_attempt SET status='SUBMITTED',submitted_at=SYSUTCDATETIME() WHERE attempt_id=@id", {
      id
    }, tx);
    await publishIfComplete(id, tx);
    return {
      message: 'Đã nộp bài. Câu tự luận/ghi âm được giáo viên chấm.'
    };
  });
}
async function publishIfComplete(id, tx) {
  const [pending] = await query('SELECT COUNT(*) n FROM test_answer WHERE attempt_id=@id AND points_awarded IS NULL', {
    id
  }, tx);
  if (pending.n) return;
  const [a] = await query('SELECT a.*,t.class_id,t.title FROM test_attempt a JOIN practice_test t ON t.test_id=a.test_id WHERE attempt_id=@id', {
    id
  }, tx);
  const totals = await query('SELECT q.section_code,SUM(ans.points_awarded) earned,SUM(q.points) possible FROM test_answer ans JOIN test_question q ON q.question_id=ans.question_id WHERE ans.attempt_id=@id GROUP BY q.section_code', {
    id
  }, tx);
  for (const total of totals) {
    const [scale] = await query('SELECT TOP 1 * FROM test_scale WHERE test_id=@test AND section_code=@section AND raw_points<=@earned ORDER BY raw_points DESC', {
      test: a.test_id,
      section: total.section_code,
      earned: total.earned
    }, tx);
    const metric = scale ? total.section_code : total.section_code + '_PERCENT',
      score = scale ? scale.scaled_score : Math.round(Number(total.earned) / Number(total.possible) * 10000) / 100,
      max = scale ? scale.max_score : 100;
    await query('IF EXISTS(SELECT 1 FROM assessment_score WHERE attempt_id=@id AND metric_code=@metric) UPDATE assessment_score SET score_value=@score,max_value=@max WHERE attempt_id=@id AND metric_code=@metric ELSE INSERT assessment_score(student_id,class_id,metric_code,score_value,max_value,assessment_date,label,attempt_id) VALUES(@student,@class,@metric,@score,@max,SYSUTCDATETIME(),@label,@id)', {
      id,
      metric,
      score,
      max,
      student: a.student_id,
      class: a.class_id,
      label: a.title
    }, tx);
  }
  await query("UPDATE test_attempt SET status='GRADED' WHERE attempt_id=@id", {
    id
  }, tx);
}
export async function gradeTest(user, id, body) {
  const a = await attemptAccess(user, id);
  await teachingAccess(user, a.class_id);
  if (a.status === 'IN_PROGRESS') invalid('TEST_IN_PROGRESS', 'Học sinh chưa nộp bài.');
  if (!Array.isArray(body.answers)) invalid('GRADE_INVALID', 'Cần danh sách điểm.');
  await transaction(async tx => {
    for (const r of body.answers) {
      const [q] = await query("SELECT q.* FROM test_question q JOIN test_attempt a ON a.test_id=q.test_id WHERE a.attempt_id=@id AND q.question_id=@q AND q.question_type IN ('WRITING','SPEAKING')", {
        id,
        q: integer(r.question_id)
      }, tx);
      const points = number(r.points_awarded);
      if (!q || points === null || points < 0 || points > Number(q.points)) invalid('GRADE_INVALID', 'Điểm tự luận/ghi âm không hợp lệ.');
      await query('UPDATE test_answer SET points_awarded=@points,feedback=@feedback WHERE attempt_id=@id AND question_id=@q', {
        id,
        q: q.question_id,
        points,
        feedback: text(r.feedback, 10000)
      }, tx);
    }
    await publishIfComplete(id, tx);
  });
  return {
    message: 'Đã lưu điểm; kết quả công bố khi chấm đủ.'
  };
}
export async function violations(user, id, body) {
  const a = await attemptAccess(user, id);
  if (a.status !== 'IN_PROGRESS' || user.role !== 'STUDENT') return {
    recorded: false
  };
  const type = ['TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT'].includes(body.event_type) ? body.event_type : 'UNKNOWN';
  await query("INSERT security_event(account_id,attempt_id,event_type) VALUES(@u,@id,@type); UPDATE test_attempt SET violation_count=violation_count+1 WHERE attempt_id=@id AND violation_count<1000", {
    u: user.account_id,
    id,
    type
  });
  return {
    recorded: true
  };
}
export async function attempts(user, testId = null) {
  if (testId) {
    const t = await testDetail(user, testId);
    if (user.role !== 'STUDENT') await teachingAccess(user, t.class_id);
  }
  return query(`SELECT a.*,t.title,ac.full_name FROM test_attempt a JOIN practice_test t ON t.test_id=a.test_id JOIN student s ON s.student_id=a.student_id JOIN account ac ON ac.account_id=s.account_id WHERE (@test IS NULL OR a.test_id=@test) AND (@role='MANAGER' OR (@role='STUDENT' AND a.student_id=@student) OR (@role='TEACHER' AND EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=t.class_id AND ct.teacher_id=@teacher))) ORDER BY a.started_at DESC`, {
    test: testId,
    role: user.role,
    student: user.student_id || null,
    teacher: user.teacher_id || null
  });
}
