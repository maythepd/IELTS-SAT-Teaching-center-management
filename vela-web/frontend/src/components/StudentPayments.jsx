'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useData, Loading, PageTitle, Table, Badge, Action } from './ui';
import { api, money } from '../lib/api';
export function Enrollments() {
  const state = useData('/student/enrollments');
  return <><PageTitle title="Đăng ký & học phí" />{state.data ? <section className="card"><Table rows={state.data} columns={[{
        key: 'name',
        label: 'Khóa học'
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
        key: 'action',
        label: 'Chi tiết',
        render: r => <Link href={'/student/enrollments/' + r.enrollment_id}>Xem / thanh toán</Link>
      }]} /></section> : <Loading {...state} />}</>;
}
export function Payment({
  id
}) {
  const state = useData('/student/enrollments/' + id),
    [payment, setPayment] = useState(null);
  if (!state.data) return <Loading {...state} />;
  const e = state.data;
  return <><PageTitle title={e.name + ' · ' + e.code} subtitle="Sau thanh toán, quản lý sẽ duyệt quyền vào lớp."><button onClick={state.reload}>Kiểm tra trạng thái</button></PageTitle><section className="card"><div className="inline"><Badge value={e.status} /><Badge value={e.payment_status} /></div><p className="course-price">{money(e.fee_snapshot)}</p>{e.status === 'SUCCESS' ? <Link href={'/student/classes/' + e.class_id}>Vào lớp →</Link> : e.payment_status === 'PAID' ? <p className="notice">Đã nhận thanh toán. Đang chờ Manager duyệt vào lớp.</p> : new Date(e.starts_at) <= new Date() ? <p className="notice">Your enrollment is recorded and a salesperson will contact you shortly for payment.</p> : <Action className="primary" work={() => api('/student/enrollments/' + id + '/payment', {
        method: 'POST'
      })} onDone={setPayment}>Hiện QR thanh toán</Action>}{payment?.qr_url && <div style={{
        marginTop: 20
      }}><img src={payment.qr_url} alt="QR tài khoản công ty" width="320" height="400" style={{
          objectFit: 'contain'
        }} /><p>{payment.qr_placeholder ? 'Ảnh placeholder — chưa dùng để chuyển tiền. Quản lý cần thay QR công ty thật.' : 'QR dùng chung của công ty. Nhập đúng số tiền và nội dung dưới đây trong ứng dụng ngân hàng.'}</p><p>Nội dung bắt buộc: <strong>{payment.reference}</strong></p><p>Chuyển đúng {money(payment.amount)}. Trạng thái được xác nhận qua SePay (nếu đã cấu hình) hoặc sau khi Manager kiểm tra tiền thực nhận.</p></div>}</section><section className="card"><Table rows={e.payments} columns={[{
        key: 'reference',
        label: 'Nội dung'
      }, {
        key: 'amount',
        label: 'Số tiền',
        render: r => money(r.amount)
      }, {
        key: 'status',
        label: 'Trạng thái',
        render: r => <Badge value={r.status} />
      }]} /></section></>;
}
