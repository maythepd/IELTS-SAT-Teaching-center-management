'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData, Loading, PageTitle, Form, Table } from './ui';
import { api, when, localInput } from '../lib/api';
export default function Calendar({
  staff = false,
  base = '/student',
  user
}) {
  const [current, setCurrent] = useState(new Date()),
    [view, setView] = useState('month'),
    [editing, setEditing] = useState(null),
    [showForm, setShowForm] = useState(false),
    [formKey, setFormKey] = useState(0),
    [selectedClass, setSelectedClass] = useState('');
  const participants = useData(staff && selectedClass ? '/teacher/classes/' + selectedClass : null);
  let from = new Date(current),
    to = new Date(current);
  if (view === 'month') {
    from = new Date(current.getFullYear(), current.getMonth(), 1);
    to = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  } else if (view === 'week') {
    from.setDate(from.getDate() - (from.getDay() + 6) % 7);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 7);
  } else {
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 1);
  }
  const state = useData((staff ? '/teacher' : '/student') + '/events?from=' + from.toISOString() + '&to=' + to.toISOString()),
    classes = useData((staff ? '/teacher' : '/student') + '/classes'),
    accounts = useData(staff && user?.role === 'MANAGER' ? '/manager/accounts' : null);
  const cells = [];
  for (let day = new Date(from); day < to; day.setDate(day.getDate() + 1)) cells.push(new Date(day));
  const move = n => {
    const d = new Date(current);
    if (view === 'month') d.setMonth(d.getMonth() + n);else d.setDate(d.getDate() + n * (view === 'week' ? 7 : 1));
    setCurrent(d);
  };
  const onEvent = e => {
    setEditing(e);
    setShowForm(true);
    setFormKey(k => k + 1);
  };
  return <><PageTitle title={staff ? 'Lịch dạy & sự kiện' : 'Lịch học của tôi'} subtitle="Buổi học, hạn bài tập, mock test và kỳ thi chính thức." /><section className="card"><div className="inline"><button onClick={() => move(-1)}>← Trước</button><button onClick={() => setCurrent(new Date())}>Hôm nay</button><button onClick={() => move(1)}>Tiếp →</button><strong>{current.toLocaleDateString('vi-VN', {
            month: 'long',
            year: 'numeric'
          })}</strong><select aria-label="Kiểu lịch" value={view} onChange={e => setView(e.target.value)}><option value="month">Tháng</option><option value="week">Tuần</option><option value="day">Ngày</option></select>{staff && <button className="primary" onClick={() => {
          setEditing(null);
          setShowForm(true);
          setFormKey(k => k + 1);
        }}>Thêm lịch</button>}</div>{!state.data ? <Loading {...state} /> : <><div className="calendar-grid" style={view === 'day' ? {
          gridTemplateColumns: '1fr'
        } : {}}>{cells.map(day => <div className="calendar-day" key={day.toISOString()}><strong>{day.toLocaleDateString('vi-VN', {
                weekday: 'short',
                day: 'numeric'
              })}</strong>{state.data.filter(e => new Date(e.starts_at).toLocaleDateString() === day.toLocaleDateString()).map(e => <div key={e.event_id}>{staff ? <button onClick={() => onEvent(e)}>{new Date(e.starts_at).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit'
                })} {e.title}</button> : <p>{e.title}</p>}{staff && e.session_id && <Link href={base + '/sessions/' + e.session_id}>Điểm danh / báo cáo</Link>}</div>)}</div>)}</div><Table rows={state.data} columns={[{
          key: 'title',
          label: 'Sự kiện'
        }, {
          key: 'event_type',
          label: 'Loại'
        }, {
          key: 'details', label: 'Chi tiết'
        }, {
          key: 'starts_at',
          label: 'Bắt đầu',
          render: r => when(r.starts_at)
        }, {
          key: 'ends_at',
          label: 'Kết thúc',
          render: r => when(r.ends_at)
        }, {
          key: 'actions',
          label: 'Thao tác',
          render: r => staff && r.session_id ? <Link href={base + '/sessions/' + r.session_id}>Ghi nhận buổi</Link> : null
        }]} /></>}</section>{staff && showForm && <section className="card"><h2>{editing ? 'Chỉnh sửa lịch' : 'Thêm sự kiện'}</h2><Form key={formKey} onValuesChange={v => setSelectedClass(v.class_id || '')} initial={editing ? {
        ...editing,
        starts_at: localInput(editing.starts_at),
        ends_at: localInput(editing.ends_at),
        reminder_at: localInput(editing.reminder_at),
        participant_ids: JSON.parse(editing.participants_json || '[]').map(p => String(p.account_id))
      } : {
        event_type: 'LESSON'
      }} fields={[{
        name: 'title',
        label: 'Tên sự kiện',
        required: true
      }, {
        name: 'event_type',
        label: 'Loại',
        options: ['LESSON', 'MOCK_TEST', 'OFFICIAL_EXAM', 'PERSONAL'],
        required: true
      }, {
        name: 'class_id',
        label: 'Lớp liên quan',
        options: (classes.data || []).map(c => ({
          value: c.class_id,
          label: c.code + ' — ' + c.course_name
        }))
      }, ...(user?.role === 'MANAGER' ? [{
        name: 'teacher_id',
        label: 'Giáo viên buổi dạy',
        options: (accounts.data || []).filter(a => a.teacher_id).map(a => ({
          value: a.teacher_id,
          label: a.full_name
        }))
      }] : []), {
        name: 'participant_ids',
        label: 'Học sinh được chọn (tùy chọn; giữ Ctrl để chọn nhiều)',
        multiple: true,
        options: (participants.data?.students || []).map(s => ({
          value: s.account_id,
          label: s.full_name
        }))
      }, {
        name: 'starts_at',
        label: 'Bắt đầu',
        type: 'datetime-local',
        required: true
      }, {
        name: 'ends_at',
        label: 'Kết thúc',
        type: 'datetime-local',
        required: true
      }, {
        name: 'reminder_at',
        label: 'Thời điểm nhắc (bỏ trống: trước 1 giờ)',
        type: 'datetime-local'
      }, {
        name: 'details', label: 'Chi tiết sự kiện', type: 'textarea', wide: true
      }]} submit={body => api('/teacher/events' + (editing ? '/' + editing.event_id : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: {
          ...body,
          starts_at: new Date(body.starts_at).toISOString(),
          ends_at: new Date(body.ends_at).toISOString(),
          reminder_at: body.reminder_at ? new Date(body.reminder_at).toISOString() : null
        }
      })} onDone={() => {
        state.reload();
        setShowForm(false);
      }} /><button onClick={() => setShowForm(false)}>Đóng form</button><small>Chỉ chủ sở hữu được sửa lịch. Hạn bài tập được sửa từ trang assignment.</small></section>}</>;
}
