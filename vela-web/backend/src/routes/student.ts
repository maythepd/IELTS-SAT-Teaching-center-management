import { Router } from 'express';
import { handle, role } from '../middleware.ts';
import { query } from '../database/db_connection.ts';
import { integer } from '../utils/errors.ts';
import * as courses from '../services/courses.ts';
import * as payments from '../services/payments.ts';
import * as learning from '../services/learning.ts';
import * as schedules from '../services/schedules.ts';
import * as tests from '../services/tests.ts';
export const studentRouter = Router();
studentRouter.use(role('STUDENT'));
studentRouter.get('/classes', handle(req => courses.listClasses(req.user)));
studentRouter.get('/classes/:id', handle(req => courses.classDetail(req.user, integer(req.params.id))));
studentRouter.get('/classes/:id/materials', handle(req => learning.materials(req.user, integer(req.params.id))));
studentRouter.get('/classes/:id/assignments', handle(req => learning.assignments(req.user, integer(req.params.id))));
studentRouter.get('/assignments/:id', handle(req => learning.assignmentDetail(req.user, integer(req.params.id))));
studentRouter.post('/assignments/:id/submission', handle(req => learning.submit(req.user, integer(req.params.id), req.body)));
studentRouter.get('/submissions', handle(req => query('SELECT s.*,a.title,a.metric_code,a.max_score FROM assignment_submission s JOIN assignment a ON a.assignment_id=s.assignment_id WHERE student_id=@id ORDER BY submitted_at DESC', {
  id: req.user.student_id
})));
studentRouter.post('/enrollments', handle(req => payments.enroll(req.user, integer(req.body.class_id))));
studentRouter.get('/enrollments', handle(req => query('SELECT e.*,g.code,c.name FROM enrollment e JOIN class_group g ON g.class_id=e.class_id JOIN course c ON c.course_id=g.course_id WHERE student_id=@id ORDER BY enrollment_id DESC', {
  id: req.user.student_id
})));
studentRouter.get('/enrollments/:id', handle(req => payments.enrollmentDetail(req.user, integer(req.params.id))));
studentRouter.post('/enrollments/:id/payment', handle(req => payments.requestPayment(req.user, integer(req.params.id))));
studentRouter.get('/progress', handle(req => learning.progress(req.user, req.user.student_id, req.query)));
studentRouter.get('/progress/:id', handle(req => learning.assessmentDetail(req.user, req.user.student_id, integer(req.params.id))));
studentRouter.get('/events', handle(req => schedules.events(req.user, req.query)));
studentRouter.get('/tests', handle(req => tests.testList(req.user, req.query.class_id ? integer(req.query.class_id) : null)));
studentRouter.get('/tests/:id', handle(req => tests.testDetail(req.user, integer(req.params.id))));
studentRouter.post('/tests/:id/start', handle(req => tests.startTest(req.user, integer(req.params.id))));
studentRouter.get('/attempts', handle(req => tests.attempts(req.user)));
studentRouter.get('/attempts/:id', handle(req => tests.attempt(req.user, integer(req.params.id))));
studentRouter.put('/attempts/:id/answers', handle(req => tests.saveAnswers(req.user, integer(req.params.id), req.body)));
studentRouter.post('/attempts/:id/submit', handle(req => tests.submitTest(req.user, integer(req.params.id))));
studentRouter.post('/attempts/:id/violation', handle(req => tests.violations(req.user, integer(req.params.id), req.body)));
