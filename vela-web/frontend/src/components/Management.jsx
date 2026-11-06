'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData, Loading, PageTitle, Form, Action, Table, Badge } from './ui';
import { api, when, money } from '../lib/api';
import { t } from '../lib/i18n';

export function ManagerDashboard({ user }) {
  const [period, setPeriod] = useState(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7)
  );
  const state = useData('/manager/dashboard?period=' + period);

  return (
    <>
      <div className="inline" style={{ marginBottom: 18 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: 'auto' }}>
          <strong>{t('Kỳ thống kê:')}</strong>{' '}
          <input
            type="month"
            style={{ width: 170, display: 'inline-block' }}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          />
        </label>
      </div>

      {!state.data ? (
        <Loading {...state} />
      ) : (
        <>
          {state.data.failed_emails_count > 0 && (
            <div className="notice">
              <span>⚠️ Có {state.data.failed_emails_count} email hệ thống gặp lỗi hoặc đang chờ thử lại.</span>
              <Link href="/manager/emails">{t('Kiểm tra ngay →')}</Link>
            </div>
          )}

          <div className="stats">
            <div className="stat">
              {t('Học viên')}
              <strong>{state.data.total_students}</strong>
              <small>{t('Học viên trong hệ thống')}</small>
            </div>
            <div className="stat">
              {t('Giáo viên')}
              <strong>{state.data.total_teachers}</strong>
              <small>{t('Đang giảng dạy')}</small>
            </div>
            <div className="stat">
              {t('Lớp đang mở')}
              <strong>{state.data.active_classes}</strong>
              <small>{t('IELTS & SAT')}</small>
            </div>
            <div className="stat">
              {t('Doanh thu tháng')} ({period})
              <strong style={{ color: 'var(--blue)' }}>{money(state.data.monthly_revenue)}</strong>
              <small>{t('Lũy kế:')} {money(state.data.all_time_revenue)}</small>
            </div>
            <div className="stat">
              {t('Ghi danh chờ duyệt')}
              <strong style={{ color: state.data.pending_enrollment_count > 0 ? '#b91c1c' : 'inherit' }}>
                {state.data.pending_enrollment_count}
              </strong>
              <small>{t('Cần xác nhận học phí / duyệt')}</small>
            </div>
            <div className="stat">
              {t('Buổi dạy chờ duyệt lương')}
              <strong style={{ color: state.data.pending_session_count > 0 ? '#d97706' : 'inherit' }}>
                {state.data.pending_session_count}
              </strong>
              <small>{t('Giáo viên đã ghi nhận buổi')}</small>
            </div>
          </div>

          <section className="card">
            <div className="page-heading" style={{ marginBottom: 12 }}>
              <h2>{t('Ghi danh & Học phí cần xử lý')} ({state.data.pending_enrollments.length})</h2>
              <Link href="/manager/enrollments">{t('Xem toàn bộ →')}</Link>
            </div>
            {state.data.pending_enrollments.length === 0 ? (
              <p className="empty">{t('Không có ghi danh nào đang chờ xử lý.')}</p>
            ) : (
              <Table
                rows={state.data.pending_enrollments}
                columns={[
                  { key: 'student_name', label: 'Học viên' },
                  { key: 'email', label: 'Email' },
                  { key: 'class_code', label: 'Lớp' },
                  { key: 'fee_snapshot', label: 'Học phí', render: r => money(r.fee_snapshot) },
                  { key: 'payment_status', label: 'Thanh toán', render: r => <Badge value={r.payment_status} /> },
                  { key: 'approved', label: 'Duyệt lớp', render: r => <Badge value={r.approved ? 'Đã duyệt' : 'Chờ duyệt'} /> },
                  {
                    key: 'action',
                    label: 'Thao tác',
                    render: () => <Link href="/manager/enrollments">{t('Xử lý ghi danh')}</Link>
                  }
                ]}
              />
            )}
          </section>

          <section className="card">
            <div className="page-heading" style={{ marginBottom: 12 }}>
              <h2>{t('Buổi dạy chờ duyệt chấm công & thù lao')} ({state.data.pending_sessions.length})</h2>
              <Link href="/manager/payroll">{t('Mở Bảng lương →')}</Link>
            </div>
            {state.data.pending_sessions.length === 0 ? (
              <p className="empty">{t('Tất cả buổi dạy đã được duyệt hoặc chưa có buổi mới ghi nhận.')}</p>
            ) : (
              <Table
                rows={state.data.pending_sessions}
                columns={[
                  { key: 'teacher_name', label: 'Giáo viên' },
                  { key: 'class_code', label: 'Lớp' },
                  { key: 'title', label: 'Buổi học' },
                  { key: 'starts_at', label: 'Thời gian', render: r => when(r.starts_at) },
                  { key: 'duration_minutes', label: 'Thời lượng', render: r => r.duration_minutes + ' phút' },
                  {
                    key: 'approval',
                    label: 'Phê duyệt lương',
                    render: r => (
                      <div className="inline">
                        <Action
                          className="primary"
                          work={() =>
                            api('/manager/sessions/' + r.session_id + '/approval', {
                              method: 'PUT',
                              body: { approved: true }
                            }).then(() => state.reload())
                          }
                        >
                          {t('Duyệt')}
                        </Action>
                        <Action
                          work={() =>
                            api('/manager/sessions/' + r.session_id + '/approval', {
                              method: 'PUT',
                              body: { approved: false }
                            }).then(() => state.reload())
                          }
                        >
                          {t('Từ chối')}
                        </Action>
                      </div>
                    )
                  }
                ]}
              />
            )}
          </section>

          <section className="card">
            <div className="page-heading" style={{ marginBottom: 12 }}>
              <h2>{t('Lịch học & Sự kiện trung tâm sắp diễn ra (14 ngày tới)')}</h2>
              <Link href="/manager/schedule">{t('Xem lịch chi tiết →')}</Link>
            </div>
            {state.data.upcoming_events.length === 0 ? (
              <p className="empty">{t('Không có sự kiện nào trong 14 ngày tới.')}</p>
            ) : (
              <Table
                rows={state.data.upcoming_events}
                columns={[
                  { key: 'title', label: 'Sự kiện / Tiết học' },
                  { key: 'event_type', label: 'Loại', render: r => <Badge value={r.event_type} /> },
                  { key: 'class_code', label: 'Lớp', render: r => r.class_code || 'Chung' },
                  { key: 'teacher_name', label: 'Phụ trách', render: r => r.teacher_name || '—' },
                  { key: 'starts_at', label: 'Bắt đầu', render: r => when(r.starts_at) },
                  {
                    key: 'action',
                    label: 'Thao tác',
                    render: () => <Link href="/manager/schedule">{t('Xem lịch')}</Link>
                  }
                ]}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}

export function AccountManagement() {
  const state = useData('/manager/accounts'),
    [edit, setEdit] = useState(null),
    [show, setShow] = useState(false),
    [permissionAccount, setPermissionAccount] = useState(null);
  return <><PageTitle title="Tài khoản & quyền truy cập"><button className="primary" onClick={() => {
        setEdit(null);
        setShow(true);
      }}>Thêm tài khoản</button></PageTitle>{state.data ? <section className="card"><Table rows={state.data} columns={[{
        key: 'full_name',
        label: 'Họ tên'
      }, {
        key: 'email',
        label: 'Email'
      }, {
        key: 'role',
        label: 'Vai trò'
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }, {
        key: 'actions',
        label: 'Thao tác',
        render: r => <div className="inline"><button onClick={() => {
            setEdit(r);
            setShow(true);
          }}>Sửa hồ sơ</button><button onClick={() => setPermissionAccount(r)}>Quyền</button></div>
      }]} /></section> : <Loading {...state} />} {show && <section className="card"><h2>{edit ? 'Sửa tài khoản' : 'Tạo tài khoản'}</h2><Form key={edit?.account_id || 'new'} initial={edit || {
        role: 'STUDENT',
        status: 'ACTIVE'
      }} fields={[{
        name: 'full_name',
        label: 'Họ tên',
        required: true
      }, {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      }, {
        name: 'role',
        label: 'Vai trò',
        options: ['STUDENT', 'TEACHER', 'MANAGER'],
        required: true,
        help: edit ? 'Vai trò hồ sơ đã có lịch sử được giữ nguyên.' : ''
      }, {
        name: 'status',
        label: 'Trạng thái',
        options: ['ACTIVE', 'LOCKED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL'],
        required: true
      }, ...(!edit ? [{
        name: 'password',
        label: 'Mật khẩu khởi tạo (ít nhất 10 ký tự)',
        type: 'password',
        required: true
      }] : [])]} submit={body => api('/manager/accounts' + (edit ? '/' + edit.account_id : ''), {
        method: edit ? 'PATCH' : 'POST',
        body
      })} onDone={() => {
        setShow(false);
        state.reload();
      }} /></section>}{permissionAccount && <Permissions key={permissionAccount.account_id} account={permissionAccount} />}</>;
}
function Permissions({
  account
}) {
  const state = useData('/manager/accounts/' + account.account_id + '/permissions'),
    [overrides, setOverrides] = useState({});
  const labels = {
    COURSE_WRITE: 'Tạo / sửa course',
    LEARNING_WRITE: 'Quản lý tài liệu và bài tập',
    GRADING_WRITE: 'Chấm bài',
    TARGET_WRITE: 'Đặt mục tiêu',
    SCHEDULE_WRITE: 'Quản lý lịch của mình',
    SESSION_WRITE: 'Ghi nhận buổi dạy',
    REPORT_WRITE: 'Báo cáo phụ huynh',
    TEST_WRITE: 'Quản lý đề thi'
  };
  if (!state.data) return <Loading {...state} />;
  return <section className="card"><h2>Quyền thao tác — {account.full_name}</h2><p className="muted">Các quyền này không mở quyền đọc lớp/hồ sơ ngoài phạm vi được phân công.</p>{Object.entries(labels).map(([code, label]) => <label className="option" key={code}><input type="checkbox" checked={overrides[code] ?? state.data.find(p => p.permission_code === code)?.allowed !== false} onChange={e => setOverrides(v => ({
        ...v,
        [code]: e.target.checked
      }))} />{label}</label>)}<Action work={() => api('/manager/accounts/' + account.account_id + '/permissions', {
      method: 'PUT',
      body: {
        permissions: Object.keys(labels).map(code => ({
          code,
          allowed: overrides[code] ?? state.data.find(p => p.permission_code === code)?.allowed !== false
        }))
      }
    })} onDone={state.reload}>Lưu quyền</Action></section>;
}
export function EnrollmentManagement() {
  const state = useData('/manager/enrollments'),
    [selected, setSelected] = useState(null);
  return <><PageTitle title="Duyệt ghi danh" subtitle="Thanh toán và phê duyệt vào lớp là hai trạng thái riêng." />{!state.data ? <Loading {...state} /> : <section className="card"><Table rows={state.data} columns={[{
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'code',
        label: 'Lớp'
      }, {
        key: 'fee_snapshot',
        label: 'Học phí',
        render: r => money(r.fee_snapshot)
      }, {
        key: 'payment_status',
        label: 'Thanh toán',
        render: r => <Badge value={r.payment_status} />
      }, {
        key: 'status',
        label: 'Ghi danh',
        render: r => <Badge value={r.status} />
      }, {
        key: 'actions',
        label: 'Thao tác',
        render: r => <div className="inline">{r.payment_status === 'PAID' && r.status !== 'SUCCESS' && <Action work={() => api('/manager/enrollments/' + r.enrollment_id + '/approval', {
            method: 'PUT',
            body: {
              approved: true
            }
          })} onDone={state.reload}>Duyệt vào lớp</Action>}{r.payment_status !== 'PAID' && <button onClick={() => setSelected(r)}>Xác nhận đã nhận tiền</button>}</div>
      }]} /></section>}{selected && <section className="card"><h2>Xác nhận tiền — {selected.full_name}</h2><Form key={selected.enrollment_id} initial={{
        amount: selected.fee_snapshot
      }} fields={[{
        name: 'amount',
        label: 'Số tiền đã nhận',
        type: 'number',
        required: true
      }, {
        name: 'note',
        label: 'Nội dung xác nhận',
        required: true
      }]} submit={body => api('/manager/enrollments/' + selected.enrollment_id + '/confirm-offline', {
        method: 'POST',
        body
      })} label="Xác nhận đã thực nhận" onDone={() => {
        state.reload();
        setSelected(null);
      }} /></section>}</>;
}
export function Payments() {
  const [selected, setSelected] = useState(null);
  const state = useData('/manager/payments'),
    events = useData('/manager/payment-events');
  return <><PageTitle title="Theo dõi học phí" subtitle="Trạng thái được cập nhật từ SePay hoặc Manager xác nhận đã nhận tiền." />{state.data ? <section className="card"><Table rows={state.data} columns={[{
        key: 'full_name',
        label: 'Học sinh'
      }, {
        key: 'code',
        label: 'Lớp'
      }, {
        key: 'reference',
        label: 'Nội dung thanh toán'
      }, {
        key: 'amount',
        label: 'Số tiền',
        render: r => money(r.amount)
      }, {
        key: 'provider',
        label: 'Kênh'
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }, {
        key: 'detail',
        label: 'Chi tiết',
        render: r => <button onClick={() => setSelected(r)}>Xem giao dịch</button>
      }]} /></section> : <Loading {...state} />}{selected && <section className="card"><h2>Giao dịch {selected.reference}</h2><p>{selected.full_name} · Lớp {selected.code}</p><p>Số tiền: {money(selected.amount)}</p><p>Mã phía ngân hàng: {selected.provider_transaction_id || '—'}</p><p>Tạo lúc: {when(selected.created_at)} · Nhận lúc: {when(selected.paid_at)}</p><Badge value={selected.status} /><button onClick={() => setSelected(null)}>Đóng</button></section>}<section className="card"><h2>Thông báo cần kiểm tra</h2>{events.data ? <Table rows={events.data.filter(e => e.status === 'NEEDS_REVIEW')} columns={[{
        key: 'external_id',
        label: 'Mã giao dịch'
      }, {
        key: 'reason',
        label: 'Lý do'
      }, {
        key: 'received_at',
        label: 'Nhận lúc',
        render: r => when(r.received_at)
      }]} /> : <Loading {...events} />}</section></>;
}
export function Rates() {
  const [ending, setEnding] = useState(null);
  const accounts = useData('/manager/accounts'),
    rates = useData('/manager/rates'),
    options = (accounts.data || []).filter(a => a.teacher_id).map(a => ({
      value: a.teacher_id,
      label: a.full_name
    }));
  return <><PageTitle title="Rate & bonus" /><section className="card"><h2>Mức trả theo giờ</h2><Form fields={[{
        name: 'teacher_id',
        label: 'Giáo viên',
        options,
        required: true
      }, {
        name: 'class_format',
        label: 'Loại lớp',
        options: ['GROUP', 'INDIVIDUAL', 'SC'],
        required: true
      }, {
        name: 'hourly_rate',
        label: 'VND/giờ',
        type: 'number',
        required: true
      }, {
        name: 'valid_from',
        label: 'Hiệu lực từ',
        type: 'date',
        required: true
      }, {
        name: 'valid_to',
        label: 'Đến ngày (để trống nếu chưa kết thúc)',
        type: 'date'
      }]} submit={body => api('/manager/rates', {
        method: 'POST',
        body
      })} onDone={rates.reload} /></section><section className="card">{rates.data ? <Table rows={rates.data} columns={[{
        key: 'full_name',
        label: 'Giáo viên'
      }, {
        key: 'class_format',
        label: 'Loại lớp'
      }, {
        key: 'hourly_rate',
        label: 'Rate',
        render: r => money(r.hourly_rate)
      }, {
        key: 'valid_from',
        label: 'Từ',
        render: r => when(r.valid_from)
      }, {
        key: 'valid_to',
        label: 'Đến',
        render: r => when(r.valid_to)
      }, {
        key: 'action',
        label: 'Hiệu lực',
        render: r => <button onClick={() => setEnding(r)}>Kết thúc rate</button>
      }]} /> : <Loading {...rates} />}</section>{ending && <section className="card"><h2>Kết thúc rate — {ending.full_name}</h2><Form key={ending.rate_id} fields={[{
        name: 'valid_to',
        label: 'Ngày kết thúc hiệu lực',
        type: 'date',
        required: true
      }]} submit={body => api('/manager/rates/' + ending.rate_id, {
        method: 'PATCH',
        body
      })} onDone={() => {
        setEnding(null);
        rates.reload();
      }} /></section>}<section className="card"><h2>Thêm khoản thưởng được duyệt</h2><Form fields={[{
        name: 'teacher_id',
        label: 'Giáo viên',
        options,
        required: true
      }, {
        name: 'period',
        label: 'Tháng',
        type: 'month',
        required: true
      }, {
        name: 'amount',
        label: 'Số tiền VND',
        type: 'number',
        required: true
      }, {
        name: 'reason',
        label: 'Lý do',
        required: true
      }]} submit={body => api('/manager/bonuses', {
        method: 'POST',
        body
      })} /></section></>;
}
export function SystemTable({
  kind
}) {
  const titles = {
      emails: 'Trạng thái gửi email',
      audit: 'Lịch sử thay đổi',
      maintenance: 'Sao lưu hệ thống'
    },
    state = useData('/manager/' + (kind === 'emails' ? 'email-status' : kind));
  const cols = kind === 'emails' ? [{
    key: 'kind',
    label: 'Loại'
  }, {
    key: 'recipient',
    label: 'Người nhận'
  }, {
    key: 'status',
    label: 'Trạng thái',
    render: r => <Badge value={r.status} />
  }, {
    key: 'attempts',
    label: 'Lần thử'
  }, {
    key: 'last_error',
    label: 'Lỗi gần nhất'
  }, {
    key: 'action',
    label: 'Thao tác',
    render: r => ['FAILED', 'RETRY'].includes(r.status) ? <Action work={() => api('/manager/email-status/' + r.email_id + '/retry', {
      method: 'POST'
    })} onDone={state.reload}>Thử lại</Action> : null
  }] : kind === 'audit' ? [{
    key: 'action',
    label: 'Hành động'
  }, {
    key: 'entity_type',
    label: 'Đối tượng'
  }, {
    key: 'actor_id',
    label: 'Người thực hiện'
  }, {
    key: 'summary',
    label: 'Ghi chú'
  }, {
    key: 'created_at',
    label: 'Thời gian',
    render: r => when(r.created_at)
  }] : [{
    key: 'run_key',
    label: 'Lần chạy'
  }, {
    key: 'status',
    label: 'Trạng thái',
    render: r => <Badge value={r.status} />
  }, {
    key: 'details',
    label: 'Kết quả'
  }, {
    key: 'created_at',
    label: 'Thời gian',
    render: r => when(r.created_at)
  }];
  return <><PageTitle title={titles[kind]}><button onClick={state.reload}>Tải lại</button></PageTitle>{state.data ? <section className="card"><Table rows={state.data} columns={cols} /></section> : <Loading {...state} />}</>;
}
