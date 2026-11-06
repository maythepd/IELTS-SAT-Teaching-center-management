'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData, Loading, PageTitle, Form, Action, Table, Badge } from './ui';
import { api, when, money } from '../lib/api';
export function Dashboard({
  user,
  base = '/teacher'
}) {
  const [period, setPeriod] = useState(new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7));
  const state = useData('/teacher/dashboard?period=' + period);
  return <><div className="welcome"><p className="eyebrow">YOUR TEACHING SPACE</p><h1>Chào mừng, {user.full_name}.</h1><p>Lịch dạy, lớp học và những bài nộp cần phản hồi, tập trung trong một nơi.</p></div><label>Tháng thống kê<input type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label>{!state.data ? <Loading {...state} /> : <><div className="stats"><div className="stat">Lớp phụ trách<strong>{state.data.classes.length}</strong></div><div className="stat">Bài chưa chấm<strong>{state.data.ungraded}</strong></div><div className="stat">Giờ dạy đã ghi nhận trong tháng<strong>{Number(state.data.teaching_hours).toFixed(2)}</strong></div><div className="stat">Thu nhập ước tính<strong>{money(state.data.estimated_income)}</strong><small>Từ buổi đã ghi nhận chưa bị từ chối và thưởng đã duyệt.</small></div><div className="stat">Báo cáo sau buổi còn thiếu<strong>{state.data.missing_feedback_count}</strong></div></div>{state.data.missing_rate && <p className="notice">Có buổi thiếu đơn giá. Chưa thể tính đầy đủ thu nhập ước tính.</p>}<section className="card"><h2>Lịch sắp tới trong 30 ngày</h2><Table rows={state.data.events} columns={[{
          key: 'title',
          label: 'Buổi / sự kiện'
        }, {
          key: 'starts_at',
          label: 'Thời gian',
          render: r => when(r.starts_at)
        }, {
          key: 'status',
          label: 'Ghi nhận',
          render: r => <Badge value={r.recorded_at ? r.approval_status : 'Chưa ghi nhận'} />
        }, {
          key: 'action',
          label: 'Thao tác',
          render: r => r.session_id ? <Link href={base + '/sessions/' + r.session_id}>Mở buổi dạy</Link> : <Link href={base + '/schedule'}>Xem lịch</Link>
        }]} /></section><section className="card"><h2>Bài nộp cần chấm</h2><Table rows={state.data.pending_submissions} columns={[{key:'full_name',label:'Học sinh'},{key:'title',label:'Bài tập'},{key:'action',label:'Xử lý',render:r => <Link href={base + '/submissions/' + r.submission_id}>Chấm & phản hồi</Link>}]} /></section><section className="card"><h2>Báo cáo sau buổi cần bổ sung</h2><Table rows={state.data.missing_feedback} columns={[{key:'full_name',label:'Học sinh'},{key:'title',label:'Buổi học'},{key:'starts_at',label:'Ngày',render:r => when(r.starts_at)},{key:'action',label:'Xử lý',render:r => <Link href={base + '/sessions/' + r.session_id + '/reports/' + r.student_id}>Viết báo cáo</Link>}]} /></section></>}</>;
}
export function Session({
  id,
  base = '/teacher'
}) {
  const state = useData('/teacher/sessions/' + id),
    [values, setValues] = useState({}),
    [duration, setDuration] = useState('');
  if (!state.data) return <Loading {...state} />;
  const s = state.data;
  return <><PageTitle title={s.title} subtitle={s.code + ' · ' + when(s.starts_at)} /><section className="card"><div className="inline"><Badge value={s.approval_status} /><label>Thời lượng thực tế (phút)<input type="number" min="1" max="1440" value={duration || s.duration_minutes || ''} onChange={e => setDuration(e.target.value)} /></label></div><Table rows={s.students} columns={[{
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'attendance',
        label: 'Điểm danh',
        render: r => <select aria-label={'Điểm danh ' + r.full_name} value={values[r.student_id] || r.status || ''} onChange={e => setValues(v => ({
          ...v,
          [r.student_id]: e.target.value
        }))}><option value="">Chưa ghi nhận</option>{['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].map(x => <option key={x}>{x}</option>)}</select>
      }, {
        key: 'report',
        label: 'Nhận xét sau buổi',
        render: r => <Link href={base + '/sessions/' + id + '/reports/' + r.student_id}>{r.report_id ? 'Sửa báo cáo' : 'Viết báo cáo'}</Link>
      }]} /><Action className="primary" work={() => api('/teacher/sessions/' + id + '/record', {
        method: 'PUT',
        body: {
          duration_minutes: duration || s.duration_minutes,
          attendance: s.students.map(r => ({
            student_id: r.student_id,
            status: values[r.student_id] || r.status || ''
          }))
        }
      })} onDone={state.reload}>Lưu điểm danh & buổi dạy</Action></section></>;
}
export function Report({
  sessionId,
  studentId
}) {
  const state = useData('/teacher/sessions/' + sessionId + '/reports/' + studentId);
  if (!state.data) return <Loading {...state} />;
  return <><PageTitle title="Báo cáo sau buổi học" subtitle="Email chỉ được gửi cho liên hệ phụ huynh đã xác nhận đồng ý." /><section className="card"><Form key={state.data.report_version || 'new'} initial={state.data} fields={[{
        name: 'participation',
        label: 'Mức độ tham gia',
        type: 'textarea',
        wide: true
      }, {
        name: 'remarks',
        label: 'Nhận xét kết quả học tập',
        type: 'textarea',
        wide: true,
        required: true
      }, {
        name: 'recommendations',
        label: 'Khuyến nghị / bài cần luyện',
        type: 'textarea',
        wide: true
      }]} submit={body => api('/teacher/sessions/' + sessionId + '/reports/' + studentId, {
        method: 'PUT',
        body
      })} label="Lưu báo cáo & gửi email" onDone={state.reload} /></section></>;
}
export function Income({
  manager = false
}) {
  const [period, setPeriod] = useState(new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh'
    }).slice(0, 7)),
    state = useData((manager ? '/manager/payroll' : '/teacher/income') + '?period=' + period);
  if (!state.data) return <><PageTitle title={manager ? 'Bảng lương giáo viên' : 'Thu nhập của tôi'} /><input type="month" value={period} onChange={e => setPeriod(e.target.value)} /><Loading {...state} /></>;
  const data = state.data,
    approved = data.sessions.filter(x => x.approval_status === 'APPROVED'),
    sum = approved.reduce((n, x) => n + Number(x.amount || 0), 0),
    bonus = data.bonus.filter(x => x.approved).reduce((n, x) => n + Number(x.amount), 0);
  return <><PageTitle title={manager ? 'Bảng lương giáo viên' : 'Thu nhập của tôi'} subtitle="Chỉ buổi được duyệt mới đóng góp vào số tiền được tính."><input type="month" value={period} onChange={e => setPeriod(e.target.value)} /></PageTitle>{data.missing_rate && <p className="notice">Có buổi chưa có rate. Chưa thể tính đầy đủ thu nhập cho các buổi đó.</p>}<div className="stats"><div className="stat">Buổi đã duyệt<strong>{approved.length}</strong></div><div className="stat">Tiền buổi đã duyệt<strong>{money(sum)}</strong></div><div className="stat">Bonus đã duyệt<strong>{money(bonus)}</strong></div><div className="stat">Tổng đã duyệt<strong>{money(sum + bonus)}</strong></div></div><section className="card"><h2>Chi tiết buổi dạy</h2><Table rows={data.sessions} columns={[{
        key: 'full_name',
        label: 'Giáo viên'
      }, {
        key: 'title',
        label: 'Buổi dạy'
      }, {
        key: 'starts_at',
        label: 'Ngày',
        render: r => when(r.starts_at)
      }, {
        key: 'duration_minutes',
        label: 'Phút'
      }, {
        key: 'effective_rate',
        label: 'Rate/giờ',
        render: r => money(r.effective_rate)
      }, {
        key: 'amount',
        label: 'Tiền buổi',
        render: r => money(r.amount)
      }, {
        key: 'approval_status',
        label: 'Duyệt',
        render: r => <Badge value={r.approval_status} />
      }, ...(manager ? [{
        key: 'action',
        label: 'Thao tác',
        render: r => <div className="inline"><Action work={() => api('/manager/sessions/' + r.session_id + '/approval', {
            method: 'PUT',
            body: {
              approved: true
            }
          })} onDone={state.reload}>Duyệt</Action><Action work={() => api('/manager/sessions/' + r.session_id + '/approval', {
            method: 'PUT',
            body: {
              approved: false
            }
          })} onDone={state.reload}>Từ chối</Action></div>
      }] : [])]} /></section><section className="card"><h2>Khoản thưởng</h2><Table rows={data.bonus} columns={[{
        key: 'full_name',
        label: 'Giáo viên'
      }, {
        key: 'reason',
        label: 'Lý do'
      }, {
        key: 'amount',
        label: 'Số tiền',
        render: r => money(r.amount)
      }]} /></section></>;
}
