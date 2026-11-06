import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

test('SQL + HTTP: account, payment, learning, schedule and payroll flows', {
  skip: process.env.RUN_SQL_TESTS !== '1', timeout: 180000
}, async t => {
  assert.ok(process.env.DB_NAME?.endsWith('_test'), 'Only a dedicated test database is allowed');
  const run = Date.now().toString(36);
  process.env.SEPAY_WEBHOOK_API_KEY = randomBytes(24).toString('hex');
  process.env.PAYMENT_ACCOUNT_NUMBER = 'TEST-ACCOUNT';
  process.env.MFA_REQUIRED = 'true';
  process.env.DATA_DIRECTORY = '../../test/artifacts/files';
  const { app } = await import('../../vela-web/backend/src/app.ts');
  const { query, close } = await import('../../vela-web/backend/src/database/db_connection.ts');
  const { passwordHash, unseal } = await import('../../vela-web/backend/src/utils/security.ts');
  const password = randomBytes(20).toString('hex');
  const messages: string[] = [];
  const mailSockets = new Set<net.Socket>();
  // A local SMTP receiver; no messages leave this machine.
  const smtp = net.createServer(socket => {
    mailSockets.add(socket);
    socket.on('close', () => mailSockets.delete(socket));
    socket.write('220 localhost test SMTP\r\n');
    let pending = '', data = false, message = '';
    socket.on('data', chunk => {
      pending += chunk.toString();
      while (pending.includes('\r\n')) {
        const at = pending.indexOf('\r\n'), line = pending.slice(0, at);
        pending = pending.slice(at + 2);
        if (data) {
          if (line === '.') { messages.push(message); message = ''; data = false; socket.write('250 accepted locally\r\n'); }
          else message += line + '\r\n';
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 localhost\r\n');
        else if (/^DATA/i.test(line)) { data = true; socket.write('354 send data\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>(resolve => smtp.listen(0, '127.0.0.1', resolve));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/api`;
  const worker = spawn(process.execPath, ['src/jobs/worker.ts'], {
    cwd: process.cwd(), env: { ...process.env, SMTP_HOST: '127.0.0.1', SMTP_PORT: String((smtp.address() as net.AddressInfo).port), SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: 'Test Center <test@example.test>' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let workerLog = '';
  worker.stderr.on('data', chunk => { workerLog += chunk; });
  t.after(async () => {
    worker.kill();
    await new Promise<void>(resolve => { if (worker.exitCode !== null) resolve(); else worker.once('exit', () => resolve()); });
    for (const socket of mailSockets) socket.destroy();
    await new Promise<void>(resolve => smtp.close(() => resolve()));
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await close();
  });
  type Client = { cookie?: string; csrf?: string; user?: any };
  async function api(client: Client, route: string, method = 'GET', body?: unknown, expected = 200) {
    const multipart = body instanceof FormData;
    const response = await fetch(url + route, { method, headers: {
      ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(client.cookie ? { Cookie: client.cookie } : {}), ...(client.csrf ? { 'X-CSRF-Token': client.csrf } : {})
    }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) client.cookie = response.headers.get('set-cookie')!.split(';')[0];
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
    return payload.data ?? payload;
  }
  async function tokenFor(email: string, purpose: string) {
    const [mail] = await query('SELECT TOP 1 protected_payload,email_id FROM email_outbox WHERE recipient=@email AND kind=@purpose ORDER BY email_id DESC', { email, purpose });
    assert.ok(mail);
    const body = unseal(mail.protected_payload).body;
    return { value: body.match(/token=([a-f0-9]+)/)?.[1] || body.match(/\b\d{6}\b/)?.[0], id: mail.email_id };
  }
  async function delivered(id: number) {
    for (let i = 0; i < 70; i++) {
      const [row] = await query('SELECT status,last_error FROM email_outbox WHERE email_id=@id', { id });
      if (row.status === 'SENT') return;
      if (row.status === 'FAILED') throw new Error(`SMTP failed: ${row.last_error}; ${workerLog}`);
      await delay(100);
    }
    throw new Error(`SMTP delivery timeout; ${workerLog}`);
  }
  async function login(email: string, client: Client = {}, loginPassword = password) {
    const challenge = await api(client, '/auth/login', 'POST', { email, password: loginPassword });
    assert.equal(challenge.mfa_required, true);
    const otp = await tokenFor(email, 'LOGIN');
    const result = await api(client, '/auth/login/verify', 'POST', { challenge: challenge.challenge, code: otp.value });
    client.csrf = result.user.csrf_token; client.user = result.user;
    return client;
  }
  let manager: Client, teacher: Client, student: Client, outsider: Client;
  let course: any, group: any, started: any, enrollment: any, payment: any, assignment: any, attempt: any;
  const email = (role: string) => `${role}-${run}@example.test`;
  await t.test('register, verify through token, deliver SMTP, enforce MFA and staff approval', async () => {
    await api({}, '/auth/register', 'POST', { email: email('student'), password, full_name: 'Test Student', role: 'STUDENT' });
    await api({}, '/auth/login', 'POST', { email: email('student'), password }, 403);
    const verify = await tokenFor(email('student'), 'VERIFY');
    await delivered(verify.id);
    assert.ok(messages.length > 0, 'SMTP receiver must actually receive mail');
    await api({}, '/auth/verify-email', 'POST', { token: verify.value });
    await api({}, '/auth/verify-email', 'POST', { token: verify.value }, 422);
    student = await login(email('student'));
    for (const role of ['MANAGER', 'TEACHER', 'STUDENT']) {
      const address = email(role.toLowerCase() === 'student' ? 'outsider' : role.toLowerCase());
      const [account] = await query("INSERT account(email,full_name,password_hash,role,status) OUTPUT INSERTED.account_id VALUES(@email,@name,@password,@role,'ACTIVE')", { email: address, name: `Test ${role}`, password: passwordHash(password), role });
      if (role === 'TEACHER') await query('INSERT teacher(account_id) VALUES(@id)', { id: account.account_id });
      if (role === 'STUDENT') await query('INSERT student(account_id) VALUES(@id)', { id: account.account_id });
    }
    manager = await login(email('manager')); teacher = await login(email('teacher')); outsider = await login(email('outsider'));
    await api({}, '/auth/register', 'POST', { email: email('pending-staff'), password, full_name: 'Pending Teacher', role: 'TEACHER' });
    const staffVerify = await tokenFor(email('pending-staff'), 'VERIFY');
    await api({}, '/auth/verify-email', 'POST', { token: staffVerify.value });
    await api({}, '/auth/login', 'POST', { email: email('pending-staff'), password }, 403);
    const [pending] = await query('SELECT * FROM account WHERE email=@email', { email: email('pending-staff') });
    await api(manager, '/manager/accounts/' + pending.account_id, 'PATCH', { full_name: pending.full_name, email: pending.email, role: pending.role, status: 'ACTIVE' });
    assert.ok((await login(email('pending-staff'))).user.teacher_id);
    await api(student, '/manager/accounts', 'GET', undefined, 403);
    await api({ cookie: manager.cookie }, '/manager/courses', 'POST', {}, 403);
  });
  await t.test('create course, edit with version, create multiple classes and assign teacher', async () => {
    course = await api(manager, '/manager/courses', 'POST', { name: `Test Course ${run}`, program: 'IELTS', level: 'Foundation', target_min: 5, target_max: 7 });
    const detail = await api(manager, '/manager/courses/' + course.course_id);
    assert.equal(detail.classes.length, 0);
    await api(manager, '/manager/courses/' + course.course_id, 'PATCH', { ...detail, name: `Edited ${run}` });
    await api(manager, '/manager/courses/' + course.course_id, 'PATCH', { ...detail, name: 'Stale update' }, 409);
    const body = { code: `TEST-${run}`, format: 'GROUP', starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 30 * 86400000).toISOString(), tuition_amount: 2000000, teacher_id: teacher.user.teacher_id };
    group = await api(manager, `/manager/courses/${course.course_id}/classes`, 'POST', body);
    started = await api(manager, `/manager/courses/${course.course_id}/classes`, 'POST', { ...body, code: `STARTED-${run}`, starts_at: new Date(Date.now() - 86400000).toISOString() });
    assert.equal((await api(manager, '/manager/courses/' + course.course_id)).classes.length, 2);
    await api(teacher, '/teacher/courses/' + course.course_id, 'PATCH', { ...detail, name: 'Unauthorized' }, 403);
  });
  await t.test('QR before start, manual receipt separately from enrollment approval, access denied until approved', async () => {
    enrollment = await api(student, '/student/enrollments', 'POST', { class_id: group.class_id });
    payment = await api(student, `/student/enrollments/${enrollment.enrollment_id}/payment`, 'POST');
    assert.match(payment.reference, /^PAY[A-F0-9]{12}$/);
    assert.equal(payment.qr_placeholder, true);
    await api(student, '/student/classes/' + group.class_id, 'GET', undefined, 403);
    await api(manager, `/manager/enrollments/${enrollment.enrollment_id}/approval`, 'PUT', { approved: true }, 422);
    await api(manager, `/manager/enrollments/${enrollment.enrollment_id}/confirm-offline`, 'POST', { amount: 1, note: 'Wrong amount' }, 422);
    await api(manager, `/manager/enrollments/${enrollment.enrollment_id}/confirm-offline`, 'POST', { amount: 2000000 }, 422);
    await api(manager, `/manager/enrollments/${enrollment.enrollment_id}/confirm-offline`, 'POST', { amount: 2000000, note: 'Test receipt; no real transfer' });
    assert.equal((await api(student, '/student/enrollments/' + enrollment.enrollment_id)).status, 'PENDING_APPROVAL');
    await api(student, '/student/classes/' + group.class_id, 'GET', undefined, 403);
    await api(manager, `/manager/enrollments/${enrollment.enrollment_id}/approval`, 'PUT', { approved: true });
    await api(student, '/student/classes/' + group.class_id);
    const late = await api(student, '/student/enrollments', 'POST', { class_id: started.class_id });
    assert.equal((await api(student, `/student/enrollments/${late.enrollment_id}/payment`, 'POST')).offline, true);
    await api(manager, `/manager/enrollments/${late.enrollment_id}/confirm-offline`, 'POST', { amount: 2000000, note: 'Test receipt after class start' });
    const [audit] = await query("SELECT * FROM audit_log WHERE entity_id=@id AND action='OFFLINE_PAYMENT'", { id: enrollment.enrollment_id });
    assert.equal(audit.actor_id, manager.user.account_id); assert.ok(audit.created_at && audit.summary);
  });
  await t.test('SePay: auth, invalid payload, wrong amount, valid event and duplicate event', async () => {
    const en = await api(outsider, '/student/enrollments', 'POST', { class_id: group.class_id });
    const pay = await api(outsider, `/student/enrollments/${en.enrollment_id}/payment`, 'POST');
    const event = { id: `${run}-bank`, transferType: 'in', accountNumber: 'TEST-ACCOUNT', transferAmount: 2000000, content: pay.reference };
    async function webhook(body: unknown, status: number, key = process.env.SEPAY_WEBHOOK_API_KEY) {
      const response = await fetch(url + '/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Apikey ' + key }, body: JSON.stringify(body) });
      assert.equal(response.status, status, JSON.stringify(await response.json()));
    }
    await webhook(event, 401, 'wrong-key'); await webhook({}, 400);
    await webhook({ ...event, id: `${run}-wrong-amount`, transferAmount: 1 }, 200);
    assert.equal((await api(outsider, '/student/enrollments/' + en.enrollment_id)).payment_status, 'UNPAID');
    await webhook(event, 200); await webhook(event, 200);
    const [count] = await query('SELECT COUNT(*) n FROM payment_event WHERE external_id=@id', { id: event.id }); assert.equal(count.n, 1);
    assert.equal((await api(outsider, '/student/enrollments/' + en.enrollment_id)).status, 'PENDING_APPROVAL');
    await api(outsider, '/student/classes/' + group.class_id, 'GET', undefined, 403);
  });
  await t.test('materials, upload/download permissions, assignment submission, grading and progress', async () => {
    const data = new FormData(); data.append('file', new Blob(['Test lesson content'], { type: 'text/plain' }), 'lesson.txt');
    const file = await api(teacher, '/files', 'POST', data);
    await api(teacher, `/teacher/classes/${group.class_id}/materials`, 'POST', { title: 'Test material', file_id: file.file_id });
    const download = await fetch(url + '/files/' + file.file_id, { headers: { Cookie: student.cookie! } });
    assert.equal(download.status, 200); assert.equal(await download.text(), 'Test lesson content');
    await api(outsider, '/files/' + file.file_id, 'GET', undefined, 403);
    assignment = await api(teacher, `/teacher/classes/${group.class_id}/assignments`, 'POST', { title: 'Test Writing', instructions: 'Write a response', task_type: 'IELTS_WRITING', metric_code: 'IELTS_WRITING', max_score: 9, due_at: new Date(Date.now() + 86400000).toISOString() });
    const submission = await api(student, `/student/assignments/${assignment.assignment_id}/submission`, 'POST', { text_content: 'Test essay response' });
    await api(student, `/student/assignments/${assignment.assignment_id}/submission`, 'POST', { text_content: 'Duplicate' }, 409);
    await api(teacher, `/teacher/submissions/${submission.submission_id}/grade`, 'PUT', { score: 6.3 }, 422);
    await api(teacher, `/teacher/submissions/${submission.submission_id}/grade`, 'PUT', { score: 6.5, feedback: 'Useful feedback' });
    assert.equal((await api(student, '/student/progress')).scores[0].score_value, 6.5);
    await query('UPDATE assignment SET due_at=DATEADD(minute,-1,SYSUTCDATETIME()) WHERE assignment_id=@id', { id: assignment.assignment_id });
    await api(student, `/student/assignments/${assignment.assignment_id}/submission`, 'POST', { text_content: 'Late' }, 422);
  });
  await t.test('test answers, auto grading and worker timeout submission', async () => {
    const exam = await api(teacher, `/teacher/classes/${group.class_id}/tests`, 'POST', { title: 'Test exam', program: 'IELTS', duration_minutes: 1, status: 'PUBLISHED', questions: [{ question_type: 'MCQ', section_code: 'IELTS_READING', prompt: 'Choose A', points: 1, options: ['A choice', 'B choice'], answer_key: 'A' }] });
    attempt = await api(student, `/student/tests/${exam.test_id}/start`, 'POST');
    const active = await api(student, '/student/attempts/' + attempt.attempt_id);
    assert.equal(active.test.questions[0].answer_key, undefined);
    await api(student, `/student/attempts/${attempt.attempt_id}/answers`, 'PUT', { answers: [{ question_id: active.test.questions[0].question_id, answer_text: 'A' }] });
    await api(student, `/student/attempts/${attempt.attempt_id}/submit`, 'POST');
    assert.equal((await api(student, '/student/attempts/' + attempt.attempt_id)).status, 'GRADED');
    const expired = await api(student, `/student/tests/${exam.test_id}/start`, 'POST');
    await query('UPDATE test_attempt SET deadline_at=DATEADD(second,-1,SYSUTCDATETIME()) WHERE attempt_id=@id', { id: expired.attempt_id });
    await api(student, `/student/attempts/${expired.attempt_id}/answers`, 'PUT', { answers: [] }, 409);
    for (let i = 0; i < 70; i++) { const [row] = await query('SELECT status FROM test_attempt WHERE attempt_id=@id', { id: expired.attempt_id }); if (row.status === 'GRADED') return; await delay(100); }
    assert.fail('Worker did not submit expired test: ' + workerLog);
  });
  await t.test('lesson, conflict detection, attendance, approval, rates, income and parent consent report', async () => {
    const body = { title: 'Test lesson', event_type: 'LESSON', class_id: group.class_id, starts_at: new Date(Date.now() - 7200000).toISOString(), ends_at: new Date(Date.now() - 3600000).toISOString() };
    const event = await api(teacher, '/teacher/events', 'POST', body);
    await api(teacher, '/teacher/events', 'POST', body, 409);
    const calendar = await api(teacher, '/teacher/events');
    const currentEvent = calendar.find(row => row.event_id === event.event_id);
    await api(manager, '/teacher/events/' + event.event_id, 'PATCH', { ...body, version: currentEvent.version }, 403);
    await api(teacher, '/teacher/events/' + event.event_id, 'PATCH', { ...body, title: 'Edited lesson', version: currentEvent.version });
    await api(teacher, '/teacher/events/' + event.event_id, 'PATCH', { ...body, version: currentEvent.version }, 409);
    const [session] = await query('SELECT * FROM teaching_session WHERE event_id=@id', { id: event.event_id });
    // Enrollment is already approved; align this test's historical success timestamp to the lesson.
    await query('UPDATE enrollment SET success_at=DATEADD(day,-1,SYSUTCDATETIME()) WHERE enrollment_id=@id', { id: enrollment.enrollment_id });
    await api(teacher, `/teacher/sessions/${session.session_id}/record`, 'PUT', { duration_minutes: 60, attendance: [{ student_id: student.user.student_id, status: 'PRESENT' }] });
    await api(manager, `/manager/sessions/${session.session_id}/approval`, 'PUT', { approved: true }, 422);
    await api(manager, '/manager/rates', 'POST', { teacher_id: teacher.user.teacher_id, class_format: 'GROUP', hourly_rate: 200000, valid_from: '2020-01-01' });
    await api(manager, `/manager/sessions/${session.session_id}/approval`, 'PUT', { approved: true });
    const period = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
    const income = await api(teacher, '/teacher/income?period=' + period);
    assert.equal(income.sessions[0].amount, 200000);
    await api(student, '/auth/parent-contact', 'POST', { email: email('parent'), name: 'Test Parent' });
    const consent = await tokenFor(email('parent'), 'CONSENT');
    const before = await api(teacher, `/teacher/sessions/${session.session_id}/reports/${student.user.student_id}`, 'PUT', { remarks: 'Progress recorded' });
    assert.match(before.message, /Chưa có phụ huynh/);
    await api({}, '/auth/verify-email', 'POST', { token: consent.value });
    await api(teacher, `/teacher/sessions/${session.session_id}/reports/${student.user.student_id}`, 'PUT', { remarks: 'Progress recorded with consent', participation: 'Active' });
    const [report] = await query("SELECT TOP 1 email_id FROM email_outbox WHERE recipient=@email AND kind='REPORT' ORDER BY email_id DESC", { email: email('parent') });
    await delivered(report.email_id);
  });
  await t.test('profile validation, permission revocation and restoring access', async () => {
    await api(student, '/auth/profile', 'PATCH', { full_name: '' }, 422);
    await api(student, '/auth/profile', 'PATCH', { full_name: 'Updated Test Student' });
    assert.equal((await api(student, '/auth/profile')).full_name, 'Updated Test Student');
    await api(manager, `/manager/accounts/${teacher.user.account_id}/permissions`, 'PUT', { permissions: [{ code: 'LEARNING_WRITE', allowed: false }] });
    await api(teacher, `/teacher/classes/${group.class_id}/materials`, 'POST', { title: 'Blocked', description: 'Blocked by manager' }, 403);
    await api(manager, `/manager/accounts/${teacher.user.account_id}/permissions`, 'PUT', { permissions: [] });
    await api(teacher, `/teacher/classes/${group.class_id}/materials`, 'POST', { title: 'Allowed again', external_url: 'javascript:alert(1)' }, 422);
    await api(teacher, `/teacher/classes/${group.class_id}/materials`, 'POST', { title: 'Allowed again', description: 'Permission restored' });
  });
  await t.test('SAT mixed test: resume, private attempts, manual grading and percentage metrics', async () => {
    const exam = await api(teacher, `/teacher/classes/${group.class_id}/tests`, 'POST', { title: 'Mixed SAT practice', program: 'SAT', duration_minutes: 10, status: 'PUBLISHED', questions: [
      { question_type: 'MCQ', section_code: 'SAT_MATH', prompt: 'Choose A', points: 1, options: ['A', 'B'], answer_key: 'A' },
      { question_type: 'WRITING', section_code: 'SAT_RW', prompt: 'Explain the answer', points: 4 }
    ] });
    const first = await api(student, `/student/tests/${exam.test_id}/start`, 'POST');
    assert.equal((await api(student, `/student/tests/${exam.test_id}/start`, 'POST')).attempt_id, first.attempt_id);
    await api(outsider, `/student/attempts/${first.attempt_id}`, 'GET', undefined, 403);
    const detail = await api(student, `/student/attempts/${first.attempt_id}`);
    const [objective, written] = detail.test.questions;
    await api(student, `/student/attempts/${first.attempt_id}/answers`, 'PUT', { answers: [{ question_id: objective.question_id, answer_text: 'A' }, { question_id: written.question_id, answer_text: 'My explanation' }] });
    await api(student, `/student/attempts/${first.attempt_id}/submit`, 'POST');
    assert.equal((await api(student, `/student/attempts/${first.attempt_id}`)).status, 'SUBMITTED');
    await api(teacher, `/teacher/attempts/${first.attempt_id}/grade`, 'PUT', { answers: [{ question_id: written.question_id, points_awarded: 5 }] }, 422);
    await api(teacher, `/teacher/attempts/${first.attempt_id}/grade`, 'PUT', { answers: [{ question_id: written.question_id, points_awarded: 3, feedback: 'Explanation reviewed' }] });
    assert.equal((await api(student, `/student/attempts/${first.attempt_id}`)).status, 'GRADED');
    const progress = await api(student, '/student/progress');
    assert.equal(progress.scores.find(row => row.attempt_id === first.attempt_id && row.metric_code === 'SAT_RW_PERCENT').score_value, 75);
    assert.equal(progress.scores.some(row => row.attempt_id === first.attempt_id && row.metric_code === 'SAT_RW'), false);
  });
  await t.test('bonus, rate overlap and immutable approved session', async () => {
    const period = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
    await api(manager, '/manager/bonuses', 'POST', { teacher_id: teacher.user.teacher_id, period, amount: 50000, reason: 'Test approved bonus' });
    assert.equal((await api(teacher, '/teacher/income?period=' + period)).bonus[0].amount, 50000);
    await api(manager, '/manager/rates', 'POST', { teacher_id: teacher.user.teacher_id, class_format: 'GROUP', hourly_rate: 300000, valid_from: '2020-01-01' }, 409);
    const [session] = await query('SELECT TOP 1 session_id FROM teaching_session WHERE class_id=@id AND recorded_at IS NOT NULL', { id: group.class_id });
    await api(teacher, `/teacher/sessions/${session.session_id}/record`, 'PUT', { duration_minutes: 30, attendance: [] }, 422);
  });
  await t.test('revoking parent consent invalidates unused confirmation links', async () => {
    await api(student, '/auth/parent-contact', 'POST', { email: email('parent'), name: 'Test Parent' });
    const unused = await tokenFor(email('parent'), 'CONSENT');
    await api(student, '/auth/parent-contact', 'POST', { email: email('parent'), name: 'Test Parent', revoke: true });
    await api({}, '/auth/verify-email', 'POST', { token: unused.value }, 422);
    const profile = await api(student, '/auth/profile');
    assert.equal(profile.parents.find(row => row.email === email('parent')).consent, false);
  });
  await t.test('assignment format/materials and authorized assessment details', async () => {
    const materials = await api(teacher, `/teacher/classes/${group.class_id}/materials`);
    const created = await api(teacher, `/teacher/classes/${group.class_id}/assignments`, 'POST', {
      title: 'Text only with materials', instructions: 'Use the attached class resource', task_type: 'IELTS_WRITING', metric_code: 'IELTS_WRITING', max_score: 9,
      due_at: new Date(Date.now()+86400000).toISOString(), submission_format: 'TEXT', material_ids: [materials[0].material_id]
    });
    const detail = await api(student, '/student/assignments/' + created.assignment_id);
    assert.equal(detail.submission_format, 'TEXT'); assert.equal(detail.materials.length, 1);
    await api(student, `/student/assignments/${created.assignment_id}/submission`, 'POST', {external_url:'https://example.test/work'}, 422);
    const submitted = await api(student, `/student/assignments/${created.assignment_id}/submission`, 'POST', {text_content:'An essay using the provided material'});
    await api(teacher, `/teacher/submissions/${submitted.submission_id}/grade`, 'PUT', {score:7,feedback:'Detailed review'});
    const [score] = await query('SELECT * FROM assessment_score WHERE submission_id=@id', {id:submitted.submission_id});
    assert.equal((await api(student,'/student/progress/'+score.score_id)).submission.feedback,'Detailed review');
    assert.equal((await api(teacher,`/teacher/students/${student.user.student_id}/assessments/${score.score_id}`)).assessment.score_value,7);
    await api(outsider,'/student/progress/'+score.score_id,'GET',undefined,404);
    await api(student,'/student/progress?from=2030-01-01&to=2029-01-01','GET',undefined,422);
    assert.equal((await api(student,'/student/progress?from=2000-01-01&to=2001-01-01')).scores.length,0);
    await api(teacher,`/teacher/classes/${group.class_id}/assignments/${created.assignment_id}`,'PATCH',{
      ...detail, submission_format:'FILE',material_ids:detail.materials.map(m=>m.material_id)
    },409);
  });
  await t.test('profile phone/date fields persist and reject invalid calendar dates', async () => {
    await api(student,'/auth/profile','PATCH',{full_name:'Updated Test Student',phone:'+84 912 345 678',date_of_birth:'2005-04-12'});
    const profile=await api(student,'/auth/profile');
    assert.equal(profile.phone,'+84 912 345 678'); assert.equal(profile.date_of_birth.slice(0,10),'2005-04-12');
    await api(student,'/auth/profile','PATCH',{full_name:'Invalid change',date_of_birth:'2005-02-31'},422);
    assert.equal((await api(student,'/auth/profile')).full_name,'Updated Test Student');
    await api(teacher,'/auth/profile','PATCH',{full_name:'Test TEACHER',phone:'0901234567'});
    assert.equal((await api(teacher,'/auth/profile')).phone,'0901234567');
  });
  await t.test('dashboard monthly hours/income, missing reports and event details', async () => {
    const starts=new Date(Date.now()-4*3600000), ends=new Date(Date.now()-3*3600000);
    const event=await api(teacher,'/teacher/events','POST',{title:'Needs feedback',event_type:'LESSON',class_id:group.class_id,starts_at:starts.toISOString(),ends_at:ends.toISOString(),details:'Bring reading handout'});
    const events=await api(teacher,'/teacher/events');
    assert.equal(events.find(e=>e.event_id===event.event_id).details,'Bring reading handout');
    const [session]=await query('SELECT session_id FROM teaching_session WHERE event_id=@id',{id:event.event_id});
    await api(teacher,`/teacher/sessions/${session.session_id}/record`,'PUT',{duration_minutes:30,attendance:[{student_id:student.user.student_id,status:'PRESENT'}]});
    const period=starts.toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7);
    const summary=await api(teacher,'/teacher/dashboard?period='+period);
    assert.ok(summary.teaching_hours>=0.5); assert.ok(summary.estimated_income>=100000);
    assert.ok(summary.missing_feedback.some(r=>r.session_id===session.session_id&&r.student_id===student.user.student_id));
    assert.ok(summary.events.every(e=>new Date(e.starts_at)>=new Date(Date.now()-1000)));
    await api(teacher,'/teacher/dashboard?period=2026-13','GET',undefined,422);
  });
  await t.test('LINK, FILE and AUDIO assignment formats are enforced by the API', async () => {
    async function create(format, type='GENERAL') {
      return api(teacher,`/teacher/classes/${group.class_id}/assignments`,'POST',{
        title:'Format '+format,task_type:type,submission_format:format,metric_code:'PERCENT',max_score:100,
        instructions:'Test submission format',due_at:new Date(Date.now()+86400000).toISOString()
      });
    }
    const link=await create('LINK');
    await api(student,`/student/assignments/${link.assignment_id}/submission`,'POST',{text_content:'Wrong format'},422);
    await api(student,`/student/assignments/${link.assignment_id}/submission`,'POST',{external_url:'https://example.test/submission'});
    const upload=new FormData();upload.append('file',new Blob(['Test file'],{type:'text/plain'}),'work.txt');
    const plain=await api(student,'/files','POST',upload);
    const file=await create('FILE');
    await api(student,`/student/assignments/${file.assignment_id}/submission`,'POST',{text_content:'Missing attachment'},422);
    await api(student,`/student/assignments/${file.assignment_id}/submission`,'POST',{file_id:plain.file_id});
    const audio=await create('AUDIO','IELTS_SPEAKING');
    await api(student,`/student/assignments/${audio.assignment_id}/submission`,'POST',{file_id:plain.file_id},422);
    // A valid silent PCM WAV fixture; this tests upload, not a physical microphone.
    const wav=Buffer.alloc(204);wav.write('RIFF',0);wav.writeUInt32LE(196,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(160,40);
    const recording=new FormData();recording.append('file',new Blob([wav],{type:'audio/wav'}),'recording.wav');
    const recorded=await api(student,'/files','POST',recording);
    await api(student,`/student/assignments/${audio.assignment_id}/submission`,'POST',{file_id:recorded.file_id});
  });
  await t.test('three-month access expiry and access restored by a newly approved class', async () => {
    const starts=new Date();starts.setUTCMonth(starts.getUTCMonth()-6);
    const ends=new Date();ends.setUTCMonth(ends.getUTCMonth()-2);
    const history=await api(manager,`/manager/courses/${course.course_id}/classes`,'POST',{
      code:'HISTORY-'+run,format:'GROUP',teacher_id:teacher.user.teacher_id,tuition_amount:100000,
      starts_at:starts.toISOString(),ends_at:ends.toISOString()
    });
    await query("INSERT enrollment(student_id,class_id,status,payment_status,approved,fee_snapshot,success_at) VALUES(@student,@class,'SUCCESS','PAID',1,100000,@at)",{
      student:outsider.user.student_id,class:history.class_id,at:starts
    });
    await api(outsider,'/auth/me');
    const expired=new Date();expired.setUTCMonth(expired.getUTCMonth()-4);
    await query('UPDATE class_group SET ends_at=@end WHERE class_id=@id',{end:expired,id:history.class_id});
    await api(outsider,'/auth/me','GET',undefined,403);
    await api({},'/auth/login','POST',{email:email('outsider'),password},403);
    const [pending]=await query('SELECT enrollment_id FROM enrollment WHERE student_id=@student AND class_id=@class',{student:outsider.user.student_id,class:group.class_id});
    await api(manager,`/manager/enrollments/${pending.enrollment_id}/approval`,'PUT',{approved:true});
    await api(outsider,'/auth/me');
  });
  await t.test('Chrome: course, class, enrollment, payment approval and material forms', { skip: process.env.RUN_BROWSER_TESTS !== '1' }, async () => {
    const { browserFlows } = await import('../browser-flows.mjs');
    await browserFlows({ apiURL: url, run, email, password, tokenFor, teacherId: teacher.user.teacher_id, query });
  });
  await t.test('logout invalidates server session', async () => {
    const oldCookie = student.cookie;
    await api(student, '/auth/logout', 'POST');
    await api({ cookie: oldCookie }, '/auth/me', 'GET', undefined, 401);
  });
  await t.test('password reset revokes sessions and rejects consumed tokens and old passwords', async () => {
    const oldSession = await login(email('student'));
    await api({}, '/auth/forgot-password', 'POST', { email: email('student') });
    const reset = await tokenFor(email('student'), 'RESET');
    const replacement = randomBytes(20).toString('hex');
    await api({}, '/auth/reset-password', 'POST', { token: reset.value, password: 'short' }, 422);
    await api({}, '/auth/reset-password', 'POST', { token: reset.value, password: replacement });
    await api({}, '/auth/reset-password', 'POST', { token: reset.value, password: replacement }, 422);
    await api(oldSession, '/auth/me', 'GET', undefined, 401);
    await api({}, '/auth/login', 'POST', { email: email('student'), password }, 401);
    assert.equal((await login(email('student'), {}, replacement)).user.student_id, student.user.student_id);
  });
});
