import { query } from '../database/db_connection.ts';
import { listClasses } from './courses.ts';
import { events } from './schedules.ts';
import { payroll } from './payroll.ts';

export async function dashboard(user, requestedPeriod = '') {
  const period = requestedPeriod || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
  const income = await payroll(user, period);
  const recorded = income.sessions.filter(s => s.approval_status !== 'REJECTED');
  const missingRate = recorded.some(s => s.amount == null);
  const params = { manager: user.role === 'MANAGER', teacher: user.teacher_id || null };
  const ungraded = await query(`SELECT TOP 50 s.submission_id,a.assignment_id,a.title,ac.full_name,COUNT(*) OVER() total
    FROM assignment_submission s JOIN assignment a ON a.assignment_id=s.assignment_id JOIN student st ON st.student_id=s.student_id JOIN account ac ON ac.account_id=st.account_id
    WHERE s.status='SUBMITTED' AND (@manager=1 OR EXISTS(SELECT 1 FROM class_teacher ct WHERE ct.class_id=a.class_id AND ct.teacher_id=@teacher)) ORDER BY s.submitted_at`, params);
  const missingFeedback = await query(`SELECT TOP 50 s.session_id,att.student_id,ac.full_name,e.title,e.starts_at,COUNT(*) OVER() total
    FROM teaching_session s JOIN schedule_event e ON e.event_id=s.event_id JOIN attendance att ON att.session_id=s.session_id
    JOIN student st ON st.student_id=att.student_id JOIN account ac ON ac.account_id=st.account_id
    WHERE s.recorded_at IS NOT NULL AND (@manager=1 OR s.teacher_id=@teacher)
    AND NOT EXISTS(SELECT 1 FROM post_class_report r WHERE r.session_id=s.session_id AND r.student_id=att.student_id) ORDER BY e.starts_at`, params);
  return {
    classes: await listClasses(user),
    events: await events(user, { from: new Date().toISOString(), to: new Date(Date.now() + 30 * 86400000).toISOString() }),
    ungraded: ungraded[0]?.total || 0,
    pending_submissions: ungraded,
    missing_feedback: missingFeedback,
    missing_feedback_count: missingFeedback[0]?.total || 0,
    period,
    teaching_hours: recorded.reduce((sum, s) => sum + Number(s.duration_minutes), 0) / 60,
    estimated_income: missingRate ? null : recorded.reduce((sum, s) => sum + Number(s.amount), 0) + income.bonus.filter(b => b.approved).reduce((sum, b) => sum + Number(b.amount), 0),
    missing_rate: missingRate
  };
}
