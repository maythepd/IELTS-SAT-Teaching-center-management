import { query, transaction } from '../database/db_connection.ts';
import { invalid, integer, text, number } from '../utils/errors.ts';
import { token, safeEqual } from '../utils/security.ts';
import { paymentMatch, enrollmentState } from '../utils/rules.ts';
import { audit } from './access.ts';
export async function enroll(user, classId) {
  if (!user.student_id) invalid('STUDENT_ONLY', 'Chỉ Student được đăng ký.', 403);
  return transaction(async tx => {
    const [g] = await query("SELECT * FROM class_group WITH(UPDLOCK,HOLDLOCK) WHERE class_id=@id AND status='OPEN' AND ends_at>SYSUTCDATETIME()", {
      id: classId
    }, tx);
    if (!g) invalid('CLASS_CLOSED', 'Lớp chưa mở hoặc đã kết thúc.');
    let [e] = await query('SELECT * FROM enrollment WITH(UPDLOCK,HOLDLOCK) WHERE student_id=@s AND class_id=@c', {
      s: user.student_id,
      c: classId
    }, tx);
    if (!e) [e] = await query('INSERT enrollment(student_id,class_id,status,fee_snapshot) OUTPUT INSERTED.* VALUES(@s,@c,@status,@amount)', {
      s: user.student_id,
      c: classId,
      status: new Date(g.starts_at) <= new Date() ? 'CONTACT_REQUIRED' : 'PENDING_PAYMENT',
      amount: g.tuition_amount
    }, tx);
    return e;
  });
}
export async function enrollmentDetail(user, id) {
  const [e] = await query('SELECT e.*,g.starts_at,g.ends_at,g.code,c.name FROM enrollment e JOIN class_group g ON g.class_id=e.class_id JOIN course c ON c.course_id=g.course_id WHERE enrollment_id=@id', {
    id
  });
  if (!e) invalid('ENROLLMENT_MISSING', 'Không tìm thấy đăng ký.', 404);
  if (user.role !== 'MANAGER' && e.student_id !== user.student_id) invalid('FORBIDDEN', 'Không được xem đăng ký này.', 403);
  return {
    ...e,
    payments: await query('SELECT * FROM tuition_payment WHERE enrollment_id=@id ORDER BY payment_id DESC', {
      id
    })
  };
}
export async function requestPayment(user, id) {
  const e = await enrollmentDetail(user, id);
  if (e.payment_status === 'PAID') return {
    already_paid: true,
    message: 'Đã thanh toán, chờ quản lý duyệt hoặc đã vào lớp.'
  };
  if (new Date(e.starts_at) <= new Date()) return {
    offline: true,
    message: 'Your enrollment is recorded and a salesperson will contact you shortly for payment.'
  };
  const bank = process.env.PAYMENT_BANK_CODE,
    account = process.env.PAYMENT_ACCOUNT_NUMBER;
  const payment = await transaction(async tx => {
    const [existing] = await query("SELECT TOP 1 * FROM tuition_payment WITH(UPDLOCK,HOLDLOCK) WHERE enrollment_id=@id AND status='PENDING' ORDER BY payment_id DESC", {
      id
    }, tx);
    if (existing) return existing;
    const reference = 'PAY' + token().slice(0, 12).toUpperCase();
    const [p] = await query("INSERT tuition_payment(enrollment_id,reference,amount,provider) OUTPUT INSERTED.* VALUES(@id,@ref,@amount,'BANK_TRANSFER')", {
      id,
      ref: reference,
      amount: e.fee_snapshot
    }, tx);
    return p;
  });
  return {
    ...payment,
    qr_url: process.env.COMPANY_QR_URL || '/company-qr.svg',
    qr_placeholder: !process.env.COMPANY_QR_URL,
    automatic_confirmation: !!(process.env.SEPAY_WEBHOOK_API_KEY && account),
    account_name: process.env.PAYMENT_ACCOUNT_NAME,
    account_number: account,
    bank
  };
}
async function updateEnrollment(id, tx) {
  await query(`UPDATE enrollment SET status=CASE WHEN payment_status='PAID' AND approved=1 THEN 'SUCCESS' WHEN payment_status='PAID' THEN 'PENDING_APPROVAL' ELSE status END, success_at=CASE WHEN payment_status='PAID' AND approved=1 THEN COALESCE(success_at,SYSUTCDATETIME()) ELSE success_at END WHERE enrollment_id=@id`, {
    id
  }, tx);
}
export async function webhook(authorization, body) {
  if (!process.env.SEPAY_WEBHOOK_API_KEY || !safeEqual(authorization || '', `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}`)) invalid('WEBHOOK_AUTH', 'Webhook không hợp lệ.', 401);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.id || !['in', 'out'].includes(body.transferType)) invalid('WEBHOOK_INVALID', 'Dữ liệu webhook không hợp lệ.', 400);
  if (!process.env.PAYMENT_ACCOUNT_NUMBER) invalid('PAYMENT_NOT_CONFIGURED', 'Chưa cấu hình tài khoản nhận tiền.', 503);
  if (!body.id || body.transferType !== 'in') return {
    success: true
  };
  const external = String(body.id),
    ref = String(body.content || '').toUpperCase().match(/\bPAY[A-F0-9]{12}\b/)?.[0];
  await transaction(async tx => {
    if ((await query('SELECT event_id FROM payment_event WITH(UPDLOCK,HOLDLOCK) WHERE external_id=@external', {
      external
    }, tx)).length) return;
    const [p] = ref ? await query('SELECT p.*,e.payment_status enrollment_payment_status FROM tuition_payment p WITH(UPDLOCK,HOLDLOCK) JOIN enrollment e WITH(UPDLOCK,HOLDLOCK) ON e.enrollment_id=p.enrollment_id WHERE p.reference=@ref', {
      ref
    }, tx) : [];
    const matched = p && p.status !== 'SUCCEEDED' && p.enrollment_payment_status !== 'PAID' && paymentMatch(body, p.reference, p.amount, process.env.PAYMENT_ACCOUNT_NUMBER);
    await query('INSERT payment_event(external_id,payment_id,status,reason) VALUES(@external,@id,@status,@reason)', {
      external,
      id: p?.payment_id || null,
      status: matched ? 'PROCESSED' : 'NEEDS_REVIEW',
      reason: matched ? null : p?.enrollment_payment_status === 'PAID' ? 'Đăng ký đã có thanh toán: kiểm tra khoản nhận thêm.' : 'Không khớp reference, số tiền hoặc tài khoản nhận'
    }, tx);
    if (!matched) return;
    if (p.status !== 'SUCCEEDED') {
      await query("UPDATE tuition_payment SET status='SUCCEEDED',provider_transaction_id=@external,paid_at=SYSUTCDATETIME() WHERE payment_id=@id", {
        id: p.payment_id,
        external
      }, tx);
      await query("UPDATE enrollment SET payment_status='PAID' WHERE enrollment_id=@id", {
        id: p.enrollment_id
      }, tx);
      await updateEnrollment(p.enrollment_id, tx);
    }
  });
  return {
    success: true
  };
}
export async function offline(user, id, body) {
  const note = text(body.note, 300);
  if (!note) invalid('NOTE_REQUIRED', 'Cần ghi chú xác nhận khoản tiền thực nhận.');
  return transaction(async tx => {
    const [e] = await query('SELECT e.*,g.starts_at FROM enrollment e WITH(UPDLOCK,HOLDLOCK) JOIN class_group g ON g.class_id=e.class_id WHERE enrollment_id=@id', {
      id
    }, tx);
    if (!e) invalid('ENROLLMENT_MISSING', 'Đăng ký không tồn tại.', 404);
    if (number(body.amount) !== Number(e.fee_snapshot)) invalid('AMOUNT_MISMATCH', 'Số tiền phải khớp học phí.');
    if (e.payment_status !== 'PAID') {
      const [pending] = await query("SELECT TOP 1 payment_id FROM tuition_payment WITH(UPDLOCK,HOLDLOCK) WHERE enrollment_id=@id AND status='PENDING' ORDER BY payment_id DESC", { id }, tx);
      if (pending) {
        await query("UPDATE tuition_payment SET status='SUCCEEDED',provider='MANUAL',confirmed_by=@actor,paid_at=SYSUTCDATETIME() WHERE payment_id=@id", {
          id: pending.payment_id,
          actor: user.account_id
        }, tx);
      } else {
      await query("INSERT tuition_payment(enrollment_id,reference,amount,status,provider,confirmed_by,paid_at) VALUES(@id,@ref,@amount,'SUCCEEDED','OFFLINE',@actor,SYSUTCDATETIME())", {
        id,
        ref: 'OFF' + token().slice(0, 16),
        amount: e.fee_snapshot,
        actor: user.account_id
      }, tx);
      }
      await query("UPDATE enrollment SET payment_status='PAID' WHERE enrollment_id=@id", {
        id
      }, tx);
      await updateEnrollment(id, tx);
    }
    await audit(user, 'OFFLINE_PAYMENT', 'enrollment', id, note, tx);
    return {
      message: 'Manager đã xác nhận thực nhận học phí. Có thể duyệt ghi danh.'
    };
  });
}
export async function approveEnrollment(user, id, approved) {
  await transaction(async tx => {
    const [e] = await query('SELECT * FROM enrollment WITH(UPDLOCK,HOLDLOCK) WHERE enrollment_id=@id', {
      id
    }, tx);
    if (!e) invalid('ENROLLMENT_MISSING', 'Đăng ký không tồn tại.', 404);
    if (approved) {
      const [g] = await query('SELECT * FROM class_group WITH(UPDLOCK,HOLDLOCK) WHERE class_id=@id', {
        id: e.class_id
      }, tx);
      if (g?.format === 'INDIVIDUAL' && (await query("SELECT enrollment_id FROM enrollment WHERE class_id=@class AND student_id<>@student AND status='SUCCESS'", {
        class: e.class_id,
        student: e.student_id
      }, tx)).length) invalid('INDIVIDUAL_FULL', 'Lớp 1:1 đã có học sinh khác.', 409);
    }
    if (approved && e.payment_status !== 'PAID') invalid('PAYMENT_REQUIRED', 'Chưa thể duyệt vào lớp khi chưa nhận đủ học phí.');
    await query("UPDATE enrollment SET approved=@approved,approved_by=@actor,status=CASE WHEN @approved=0 THEN 'CANCELLED' ELSE status END WHERE enrollment_id=@id", {
      id,
      approved: !!approved,
      actor: user.account_id
    }, tx);
    if (approved) await updateEnrollment(id, tx);
    await audit(user, 'ENROLLMENT_APPROVAL', 'enrollment', id, String(approved), tx);
  });
  return {
    message: 'Đã cập nhật phê duyệt ghi danh.'
  };
}
