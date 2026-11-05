import { query, transaction } from '../database/db_connection.ts';
import { invalid, text, number, date, integer } from '../utils/errors.ts';
import { audit } from './access.ts';
import { periodBounds } from '../utils/rules.ts';
export async function payroll(user, period) {
  if (!/^\d{4}-\d{2}$/.test(period) || Number(period.slice(5)) < 1 || Number(period.slice(5)) > 12) invalid('PERIOD_INVALID', 'Chọn tháng theo YYYY-MM.');
  const {
    start,
    end
  } = periodBounds(period);
  const sessions = await query(`SELECT s.*,e.starts_at,e.title,g.code,g.format,ac.full_name,COALESCE(s.hourly_rate,r.hourly_rate) effective_rate,
 CASE WHEN COALESCE(s.hourly_rate,r.hourly_rate) IS NULL THEN NULL ELSE ROUND(CAST(s.duration_minutes AS DECIMAL(18,4))/60*COALESCE(s.hourly_rate,r.hourly_rate),2) END amount
 FROM teaching_session s JOIN schedule_event e ON e.event_id=s.event_id JOIN class_group g ON g.class_id=s.class_id JOIN teacher t ON t.teacher_id=s.teacher_id JOIN account ac ON ac.account_id=t.account_id
 OUTER APPLY(SELECT TOP 1 hourly_rate FROM teacher_rate tr WHERE tr.teacher_id=s.teacher_id AND tr.class_format=g.format AND tr.valid_from<=CAST(DATEADD(hour,7,e.starts_at) AS DATE) AND (tr.valid_to IS NULL OR tr.valid_to>=CAST(DATEADD(hour,7,e.starts_at) AS DATE)) ORDER BY tr.valid_from DESC) r
 WHERE s.recorded_at IS NOT NULL AND e.starts_at>=@start AND e.starts_at<@end AND (@teacher IS NULL OR s.teacher_id=@teacher) ORDER BY ac.full_name,e.starts_at`, {
    start,
    end,
    teacher: user.role === 'TEACHER' ? user.teacher_id : null
  });
  const bonus = await query('SELECT b.*,a.full_name FROM teacher_bonus b JOIN teacher t ON t.teacher_id=b.teacher_id JOIN account a ON a.account_id=t.account_id WHERE period=@period AND (@teacher IS NULL OR b.teacher_id=@teacher)', {
    period,
    teacher: user.role === 'TEACHER' ? user.teacher_id : null
  });
  return {
    sessions,
    bonus,
    period,
    missing_rate: sessions.some(s => s.effective_rate === null)
  };
}
export async function approveSession(user, id, approved) {
  return transaction(async tx => {
    const [s] = await query('SELECT s.*,e.starts_at,g.format FROM teaching_session s WITH(UPDLOCK,HOLDLOCK) JOIN schedule_event e ON e.event_id=s.event_id JOIN class_group g ON g.class_id=s.class_id WHERE session_id=@id', {
      id
    }, tx);
    if (!s?.recorded_at) invalid('SESSION_UNRECORDED', 'Buổi chưa được ghi nhận.');
    let rate = null;
    if (approved) {
      const rates = await query('SELECT * FROM teacher_rate WHERE teacher_id=@t AND class_format=@f AND valid_from<=CAST(@at AS DATE) AND (valid_to IS NULL OR valid_to>=CAST(@at AS DATE))', {
        t: s.teacher_id,
        f: s.format,
        at: new Date(new Date(s.starts_at).getTime() + 7 * 3600000)
      }, tx);
      if (rates.length !== 1) invalid('RATE_REQUIRED', 'Cần đúng một mức rate có hiệu lực cho buổi dạy.');
      rate = rates[0].hourly_rate;
    }
    await query('UPDATE teaching_session SET approval_status=@status,approved_by=@u,hourly_rate=@rate WHERE session_id=@id', {
      id,
      status: approved ? 'APPROVED' : 'REJECTED',
      u: user.account_id,
      rate
    }, tx);
    await audit(user, 'SESSION_APPROVAL', 'teaching_session', id, String(approved), tx);
    return {
      message: 'Đã cập nhật duyệt buổi dạy.'
    };
  });
}
export async function addRate(user, body) {
  const teacher = integer(body.teacher_id),
    rate = number(body.hourly_rate),
    from = date(body.valid_from),
    to = body.valid_to ? date(body.valid_to) : null;
  if (rate === null || rate < 0 || !['GROUP', 'INDIVIDUAL', 'SC'].includes(body.class_format) || to && to < from) invalid('RATE_INVALID', 'Mức trả hoặc thời gian hiệu lực không hợp lệ.');
  await transaction(async tx => {
    const overlaps = await query("SELECT rate_id FROM teacher_rate WITH(UPDLOCK,HOLDLOCK) WHERE teacher_id=@t AND class_format=@f AND valid_from<=COALESCE(@to,CAST('9999-12-31' AS DATE)) AND (valid_to IS NULL OR valid_to>=@from)", {
      t: teacher,
      f: body.class_format,
      from,
      to
    }, tx);
    if (overlaps.length) invalid('RATE_OVERLAP', 'Rate bị chồng lấn khoảng hiệu lực.', 409);
    await query('INSERT teacher_rate(teacher_id,class_format,hourly_rate,valid_from,valid_to) VALUES(@t,@f,@rate,@from,@to)', {
      t: teacher,
      f: body.class_format,
      rate,
      from,
      to
    }, tx);
    await audit(user, 'RATE_CREATE', 'teacher', teacher, '', tx);
  });
  return {
    message: 'Đã lưu rate.'
  };
}
export async function addBonus(user, body) {
  const teacher = integer(body.teacher_id),
    amount = number(body.amount),
    period = text(body.period, 7);
  if (amount === null || amount < 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) invalid('BONUS_INVALID', 'Khoản thưởng hoặc tháng không hợp lệ.');
  await transaction(async tx => {
    await query('INSERT teacher_bonus(teacher_id,period,amount,reason,approved,created_by) VALUES(@t,@p,@amount,@reason,1,@u)', {
      t: teacher,
      p: period,
      amount,
      reason: text(body.reason, 500),
      u: user.account_id
    }, tx);
    await audit(user, 'BONUS_CREATE', 'teacher', teacher, '', tx);
  });
  return {
    message: 'Đã lưu khoản thưởng.'
  };
}
export async function endRate(user, id, body) {
  const end = date(body.valid_to);
  await transaction(async tx => {
    const [r] = await query('SELECT * FROM teacher_rate WITH(UPDLOCK,HOLDLOCK) WHERE rate_id=@id', {
      id
    }, tx);
    if (!r) invalid('RATE_MISSING', 'Không có rate.', 404);
    if (end < new Date(r.valid_from)) invalid('RATE_INVALID', 'Ngày kết thúc trước ngày hiệu lực.');
    const overlaps = await query('SELECT rate_id FROM teacher_rate WHERE teacher_id=@t AND class_format=@f AND rate_id<>@id AND valid_from<=@end AND (valid_to IS NULL OR valid_to>=@from)', {
      t: r.teacher_id,
      f: r.class_format,
      id,
      end,
      from: r.valid_from
    }, tx);
    if (overlaps.length) invalid('RATE_OVERLAP', 'Khoảng hiệu lực chồng rate khác.');
    await query('UPDATE teacher_rate SET valid_to=@end WHERE rate_id=@id', {
      id,
      end
    }, tx);
    await audit(user, 'RATE_END', 'teacher_rate', id, '', tx);
  });
  return {
    message: 'Đã cập nhật ngày kết thúc rate.'
  };
}
