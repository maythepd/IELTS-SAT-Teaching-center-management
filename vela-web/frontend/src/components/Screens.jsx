'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Shell from './Shell';
import { ClassList, ClassDetail, SubmissionPage, GradingList, GradingPage, Results } from './Learning';
import Progress from './Progress';
import Calendar from './Calendar';
import { Dashboard, Session, Report, Income } from './Teaching';
import { ManagerDashboard, AccountManagement, EnrollmentManagement, Payments, Rates, SystemTable } from './Management';
import CourseManagement from './CourseManagement';
import { Enrollments, Payment } from './StudentPayments';
import { Tests, TestEditor, AttemptList, Attempt } from './Tests';
import { useData, Loading, PageTitle } from './ui';
import { t } from '../lib/i18n';
function StudentHome({
  user
}) {
  const state = useData('/student/classes');
  return <>
    {state.data ? <div className="stats"><div className="stat">{t('Lớp đang truy cập')}<strong>{state.data.length}</strong></div><div className="stat"><Link href="/student/tests">{t('Luyện thi trực tuyến →')}</Link><p className="muted">{t('Làm bài và xem phản hồi.')}</p></div><div className="stat"><Link href="/student/progress">{t('Tiến độ theo kỹ năng →')}</Link><p className="muted">{t('Kết quả và mục tiêu của bạn.')}</p></div></div> : <Loading {...state} />}<ClassList /></>;
}
function TeacherScreen({
  path,
  user,
  base = '/teacher'
}) {
  const [section, id, sub, student] = path;
  if (!section) return <Dashboard user={user} base={base} />;
  if (section === 'classes') return id ? <ClassDetail id={id} staff base={base} /> : <ClassList staff base={base} />;
  if (section === 'courses') return <CourseManagement user={user} />;
  if (section === 'schedule') return <Calendar staff user={user} base={base} />;
  if (section === 'sessions') return sub === 'reports' ? <Report sessionId={id} studentId={student} /> : <Session id={id} base={base} />;
  if (section === 'assignments') return <GradingList id={id} base={base} />;
  if (section === 'submissions') return <GradingPage id={id} />;
  if (section === 'students') return <Progress studentId={id} />;
  if (section === 'income') return <Income />;
  if (section === 'tests') return id ? <TestEditor id={id === 'new' ? null : id} base={base} /> : <Tests staff base={base} />;
  if (section === 'attempts') return <Attempt id={id} staff />;
  return <p>Không tìm thấy trang.</p>;
}
export function StudentApp() {
  const path = useParams().path || [];
  return <Shell>{user => {
      if (user.role !== 'STUDENT') return <p>Trang này dành cho Student.</p>;
      const [section, id] = path;
      if (!section) return <StudentHome user={user} />;
      if (section === 'classes') return id ? <ClassDetail id={id} /> : <ClassList />;
      if (section === 'assignments') return <SubmissionPage id={id} />;
      if (section === 'results') return <Results />;
      if (section === 'progress') return <Progress />;
      if (section === 'schedule') return <Calendar user={user} />;
      if (section === 'enrollments') return id ? <Payment id={id} /> : <Enrollments />;
      if (section === 'tests') return <Tests />;
      if (section === 'attempts') return id ? <Attempt id={id} /> : <AttemptList />;
      return <p>Không tìm thấy trang.</p>;
    }}</Shell>;
}
export function TeacherApp() {
  const path = useParams().path || [];
  return <Shell>{user => ['TEACHER', 'MANAGER'].includes(user.role) ? <TeacherScreen path={path} user={user} /> : <p>Trang này dành cho Teacher.</p>}</Shell>;
}
export function ManagerApp() {
  const path = useParams().path || [];
  return <Shell>{user => {
      if (user.role !== 'MANAGER') return <p>Trang này dành cho Manager.</p>;
      const [section] = path;
      if (!section) return <ManagerDashboard user={user} />;
      if (section === 'accounts') return <AccountManagement />;
      if (section === 'courses') return <CourseManagement user={user} />;
      if (section === 'enrollments') return <EnrollmentManagement />;
      if (section === 'payments') return <Payments />;
      if (section === 'payroll') return <Income manager />;
      if (section === 'rates') return <Rates />;
      if (['emails', 'audit', 'maintenance'].includes(section)) return <SystemTable kind={section} />;
      return <TeacherScreen path={path} user={user} base="/manager" />;
    }}</Shell>;
}
