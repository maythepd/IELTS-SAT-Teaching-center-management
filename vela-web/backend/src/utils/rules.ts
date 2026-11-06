export function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}
export function enrollmentState(paymentStatus, approved) {
  return paymentStatus === 'PAID' ? approved ? 'SUCCESS' : 'PENDING_APPROVAL' : 'PENDING_PAYMENT';
}
export function periodBounds(period) {
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - 7 * 3600000),
    end: new Date(Date.UTC(year, month, 1) - 7 * 3600000)
  };
}
export function scoreValid(metric, score, max) {
  if (!Number.isFinite(score) || !Number.isFinite(max) || score < 0 || max <= 0 || score > max) return false;
  if (metric === 'PERCENT' || metric.endsWith('_PERCENT')) return max === 100;
  if (metric.startsWith('IELTS_')) return max === 9 && Number.isInteger(score * 2);
  if (metric === 'SAT_MATH' || metric === 'SAT_RW') return max === 800 && score >= 200 && Number.isInteger(score / 10);
  if (metric === 'SAT_TOTAL') return max === 1600 && score >= 400 && Number.isInteger(score / 10);
  return true;
}
export function paymentMatch(event, reference, amount, account) {
  return event.transferType === 'in' && String(event.accountNumber) === String(account) && Number(event.transferAmount) === Number(amount) && String(event.content || '').toUpperCase().split(/[^A-Z0-9]+/).includes(reference.toUpperCase());
}
