'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData, Loading, PageTitle, Form, Table } from './ui';
import { api, when, localInput } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Calendar({
  staff = false,
  base = '/student',
  user
}) {
  const { t, isEn } = useLang();
  const weekdaysList = isEn
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const [current, setCurrent] = useState(new Date()),
    [view, setView] = useState('month'),
    [editing, setEditing] = useState(null),
    [showForm, setShowForm] = useState(false),
    [formKey, setFormKey] = useState(0),
    [selectedClass, setSelectedClass] = useState('');
  const participants = useData(staff && selectedClass ? '/teacher/classes/' + selectedClass : null);

  let from, to;
  const cells = [];

  if (view === 'month') {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const startDay = firstOfMonth.getDay(); // 0 is Sunday (CN), 1 is Mon, ..., 6 is Sat

    // Previous month padding so column 0 is always Sunday (CN)
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ date: d, isCurrentMonth: false });
    }
    // Days in current month
    for (let d = 1; d <= lastOfMonth.getDate(); d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // Next month padding to finish the 7-day row
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    from = new Date(cells[0].date);
    from.setHours(0, 0, 0, 0);
    to = new Date(cells[cells.length - 1].date);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    const sunday = new Date(current);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    sunday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(d.getDate() + i);
      cells.push({ date: d, isCurrentMonth: true });
    }

    from = new Date(sunday);
    to = new Date(sunday);
    to.setDate(to.getDate() + 7);
  } else {
    from = new Date(current);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 1);

    cells.push({ date: new Date(current), isCurrentMonth: true });
  }

  const state = useData((staff ? '/teacher' : '/student') + '/events?from=' + from.toISOString() + '&to=' + to.toISOString()),
    classes = useData((staff ? '/teacher' : '/student') + '/classes'),
    accounts = useData(staff && user?.role === 'MANAGER' ? '/manager/accounts' : null);

  const move = n => {
    const d = new Date(current);
    if (view === 'month') d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n * (view === 'week' ? 7 : 1));
    setCurrent(d);
  };

  const onEvent = e => {
    setEditing(e);
    setShowForm(true);
    setFormKey(k => k + 1);
  };

  return (
    <>
      <PageTitle
        title={staff ? t('calendarTitleStaff') : t('calendarTitleStudent')}
        subtitle={t('calendarSubtitle')}
      />
      <section className="card">
        <div className="inline">
          <button onClick={() => move(-1)}>{t('← Trước')}</button>
          <button onClick={() => setCurrent(new Date())}>{t('Hôm nay')}</button>
          <button onClick={() => move(1)}>{t('Tiếp →')}</button>
          <strong>
            {current.toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
              month: 'long',
              year: 'numeric'
            })}
          </strong>
          <select aria-label="Kiểu lịch" value={view} onChange={e => setView(e.target.value)}>
            <option value="month">{t('Tháng')}</option>
            <option value="week">{t('Tuần')}</option>
            <option value="day">{t('Ngày')}</option>
          </select>
          {staff && (
            <button
              className="primary"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
                setFormKey(k => k + 1);
              }}
            >
              {t('+ Thêm lịch')}
            </button>
          )}
        </div>

        {!state.data ? (
          <Loading {...state} />
        ) : (
          <>
            <div
              className="calendar-grid"
              style={view === 'day' ? { gridTemplateColumns: '1fr' } : {}}
            >
              {view !== 'day' &&
                weekdaysList.map(dayName => (
                  <div key={dayName} className="calendar-col-header">
                    {dayName}
                  </div>
                ))}

              {cells.map(({ date: day, isCurrentMonth }) => {
                const isToday = day.toDateString() === new Date().toDateString();
                const dayEvents = (state.data || []).filter(
                  e => new Date(e.starts_at).toDateString() === day.toDateString()
                );
                return (
                  <div
                    className={`calendar-day ${!isCurrentMonth ? 'calendar-day-muted' : ''} ${isToday ? 'calendar-day-today' : ''}`}
                    key={day.toISOString()}
                  >
                    <div className="calendar-day-header">
                      <span className={`calendar-day-number ${isToday ? 'today-badge' : ''}`}>
                        {day.getDate()}
                      </span>
                      {!isCurrentMonth && (
                        <span className="calendar-month-hint">Th{day.getMonth() + 1}</span>
                      )}
                    </div>
                    {dayEvents.map(e => (
                      <div key={e.event_id} className="calendar-event-item">
                        {staff ? (
                          <button onClick={() => onEvent(e)}>
                            {new Date(e.starts_at).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}{' '}
                            {e.title}
                          </button>
                        ) : (
                          <p>{e.title}</p>
                        )}
                        {staff && e.session_id && (
                          <Link href={base + '/sessions/' + e.session_id}>Điểm danh / báo cáo</Link>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <Table
              rows={state.data}
              columns={[
                { key: 'title', label: 'Sự kiện' },
                { key: 'event_type', label: 'Loại' },
                { key: 'details', label: 'Chi tiết' },
                { key: 'starts_at', label: 'Bắt đầu', render: r => when(r.starts_at) },
                { key: 'ends_at', label: 'Kết thúc', render: r => when(r.ends_at) },
                {
                  key: 'actions',
                  label: 'Thao tác',
                  render: r => staff && r.session_id ? <Link href={base + '/sessions/' + r.session_id}>Ghi nhận buổi</Link> : null
                }
              ]}
            />
          </>
        )}
      </section>

      {staff && showForm && (
        <section className="card">
          <h2>{editing ? 'Chỉnh sửa lịch' : 'Thêm sự kiện'}</h2>
          <Form
            key={formKey}
            onValuesChange={v => setSelectedClass(v.class_id || '')}
            initial={
              editing
                ? {
                    ...editing,
                    starts_at: localInput(editing.starts_at),
                    ends_at: localInput(editing.ends_at),
                    reminder_at: localInput(editing.reminder_at),
                    participant_ids: JSON.parse(editing.participants_json || '[]').map(p => String(p.account_id))
                  }
                : { event_type: 'LESSON' }
            }
            fields={[
              { name: 'title', label: 'Tên sự kiện', required: true },
              {
                name: 'event_type',
                label: 'Loại',
                options: ['LESSON', 'MOCK_TEST', 'OFFICIAL_EXAM', 'PERSONAL'],
                required: true
              },
              {
                name: 'class_id',
                label: 'Lớp liên quan',
                options: (classes.data || []).map(c => ({
                  value: c.class_id,
                  label: c.code + ' — ' + c.course_name
                }))
              },
              ...(user?.role === 'MANAGER'
                ? [
                    {
                      name: 'teacher_id',
                      label: 'Giáo viên buổi dạy',
                      options: (accounts.data || [])
                        .filter(a => a.teacher_id)
                        .map(a => ({
                          value: a.teacher_id,
                          label: a.full_name
                        }))
                    }
                  ]
                : []),
              {
                name: 'participant_ids',
                label: 'Học sinh được chọn (tùy chọn; giữ Ctrl để chọn nhiều)',
                multiple: true,
                options: (participants.data?.students || []).map(s => ({
                  value: s.account_id,
                  label: s.full_name
                }))
              },
              { name: 'starts_at', label: 'Bắt đầu', type: 'datetime-local', required: true },
              { name: 'ends_at', label: 'Kết thúc', type: 'datetime-local', required: true },
              {
                name: 'reminder_at',
                label: 'Thời điểm nhắc (bỏ trống: trước 1 giờ)',
                type: 'datetime-local'
              },
              { name: 'details', label: 'Chi tiết sự kiện', type: 'textarea', wide: true }
            ]}
            submit={body =>
              api('/teacher/events' + (editing ? '/' + editing.event_id : ''), {
                method: editing ? 'PATCH' : 'POST',
                body: {
                  ...body,
                  starts_at: new Date(body.starts_at).toISOString(),
                  ends_at: new Date(body.ends_at).toISOString(),
                  reminder_at: body.reminder_at ? new Date(body.reminder_at).toISOString() : null
                }
              })
            }
            onDone={() => {
              state.reload();
              setShowForm(false);
            }}
          />
          <button onClick={() => setShowForm(false)}>Đóng form</button>
          <small>Chỉ chủ sở hữu được sửa lịch. Hạn bài tập được sửa từ trang assignment.</small>
        </section>
      )}
    </>
  );
}
