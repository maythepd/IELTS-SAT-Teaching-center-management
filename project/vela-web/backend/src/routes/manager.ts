import { Router } from 'express';
import { handle, role } from '../middleware.ts';
import { query } from '../database/db_connection.ts';
import { integer } from '../utils/errors.ts';
import * as accounts from '../services/accounts.ts';
import * as courses from '../services/courses.ts';
import * as payments from '../services/payments.ts';
import * as payroll from '../services/payroll.ts';
export const managerRouter = Router();
managerRouter.use(role('MANAGER'));
managerRouter.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.path.startsWith('/courses')) await accounts.permission(req.user, 'COURSE_WRITE');
  next();
});
managerRouter.get('/accounts', handle(() => accounts.accounts()));
managerRouter.post('/accounts', handle(req => accounts.saveAccount(req.user, req.body)));
managerRouter.patch('/accounts/:id', handle(req => accounts.saveAccount(req.user, req.body, integer(req.params.id))));
managerRouter.get('/accounts/:id/permissions', handle(req => query('SELECT permission_code,allowed FROM account_permission WHERE account_id=@id', {
  id: integer(req.params.id)
})));
managerRouter.put('/accounts/:id/permissions', handle(req => accounts.setPermissions(req.user, integer(req.params.id), req.body)));
managerRouter.get('/courses', handle(req => courses.listCourses(req.user, req.query.keyword)));
managerRouter.get('/courses/:id', handle(req => courses.courseDetail(integer(req.params.id))));
managerRouter.post('/courses', handle(req => courses.saveCourse(req.user, req.body)));
managerRouter.patch('/courses/:id', handle(req => courses.saveCourse(req.user, req.body, integer(req.params.id))));
managerRouter.post('/courses/:id/classes', handle(req => courses.saveClass(req.user, integer(req.params.id), req.body)));
managerRouter.patch('/courses/:course/classes/:id', handle(req => courses.saveClass(req.user, integer(req.params.course), req.body, integer(req.params.id))));
managerRouter.get('/enrollments', handle(() => query('SELECT e.*,g.code,g.starts_at,a.full_name,a.email FROM enrollment e JOIN class_group g ON g.class_id=e.class_id JOIN student s ON s.student_id=e.student_id JOIN account a ON a.account_id=s.account_id ORDER BY requested_at DESC')));
managerRouter.post('/enrollments/:id/confirm-offline', handle(req => payments.offline(req.user, integer(req.params.id), req.body)));
managerRouter.put('/enrollments/:id/approval', handle(req => payments.approveEnrollment(req.user, integer(req.params.id), req.body.approved === true)));
managerRouter.get('/payments', handle(() => query('SELECT p.*,a.full_name,g.code FROM tuition_payment p JOIN enrollment e ON e.enrollment_id=p.enrollment_id JOIN student s ON s.student_id=e.student_id JOIN account a ON a.account_id=s.account_id JOIN class_group g ON g.class_id=e.class_id ORDER BY payment_id DESC')));
managerRouter.get('/payment-events', handle(() => query('SELECT TOP 200 * FROM payment_event ORDER BY event_id DESC')));
managerRouter.get('/payroll', handle(req => payroll.payroll(req.user, String(req.query.period || ''))));
managerRouter.put('/sessions/:id/approval', handle(req => payroll.approveSession(req.user, integer(req.params.id), req.body.approved === true)));
managerRouter.get('/rates', handle(() => query('SELECT r.*,a.full_name FROM teacher_rate r JOIN teacher t ON t.teacher_id=r.teacher_id JOIN account a ON a.account_id=t.account_id ORDER BY valid_from DESC')));
managerRouter.patch('/rates/:id', handle(req => payroll.endRate(req.user, integer(req.params.id), req.body)));
managerRouter.post('/rates', handle(req => payroll.addRate(req.user, req.body)));
managerRouter.post('/bonuses', handle(req => payroll.addBonus(req.user, req.body)));
managerRouter.get('/email-status', handle(() => query('SELECT TOP 200 email_id,kind,recipient,status,attempts,last_error,next_attempt_at,sent_at FROM email_outbox ORDER BY email_id DESC')));
managerRouter.post('/email-status/:id/retry', handle(async req => {
  await query("UPDATE email_outbox SET status='PENDING',attempts=0,next_attempt_at=SYSUTCDATETIME(),lease_until=NULL WHERE email_id=@id AND status IN ('FAILED','RETRY')", {
    id: integer(req.params.id)
  });
  return {
    message: 'Đã đưa email vào hàng đợi thử lại.'
  };
}));
managerRouter.get('/audit', handle(() => query('SELECT TOP 200 * FROM audit_log ORDER BY audit_id DESC')));
managerRouter.get('/maintenance', handle(() => query('SELECT TOP 60 * FROM maintenance_run ORDER BY created_at DESC')));
