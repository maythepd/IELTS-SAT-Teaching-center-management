import test from 'node:test';
import { enrollmentState, scoreValid, overlaps, paymentMatch, periodBounds } from '../../vela-web/backend/src/utils/rules.ts';
function equal(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
test('paid tuition alone does not grant enrollment before manager approval', () => {
  equal(enrollmentState('PAID', false), 'PENDING_APPROVAL');
  equal(enrollmentState('PAID', true), 'SUCCESS');
  equal(enrollmentState('UNPAID', true), 'PENDING_PAYMENT');
});
test('back-to-back lessons are allowed, real overlap is detected', () => {
  equal(overlaps('2026-11-05T01:00Z', '2026-11-05T02:00Z', '2026-11-05T02:00Z', '2026-11-05T03:00Z'), false);
  equal(overlaps('2026-11-05T01:00Z', '2026-11-05T02:01Z', '2026-11-05T02:00Z', '2026-11-05T03:00Z'), true);
});
test('IELTS bands are not confused with raw percentages or SAT scores', () => {
  equal(scoreValid('IELTS_WRITING', 6.5, 9), true);
  equal(scoreValid('IELTS_WRITING', 6.3, 9), false);
  equal(scoreValid('IELTS_WRITING', 95, 100), false);
  equal(scoreValid('SAT_MATH', 720, 800), true);
  equal(scoreValid('SAT_MATH', 725, 800), false);
  equal(scoreValid('IELTS_READING_PERCENT', 75, 100), true);
  equal(scoreValid('PERCENT', null, 100), false);
});
test('payment requires exact reference, account, direction and amount', () => {
  const e = {
    transferType: 'in',
    accountNumber: '1234',
    transferAmount: 2000000,
    content: 'Pay PAY1234ABCD5678'
  };
  equal(paymentMatch(e, 'PAY1234ABCD5678', 2000000, '1234'), true);
  equal(paymentMatch({
    ...e,
    transferAmount: 1999999
  }, 'PAY1234ABCD5678', 2000000, '1234'), false);
  equal(paymentMatch({
    ...e,
    content: 'PAY1234ABCD5678OTHER'
  }, 'PAY1234ABCD5678', 2000000, '1234'), false);
  equal(paymentMatch({
    ...e,
    transferType: 'out'
  }, 'PAY1234ABCD5678', 2000000, '1234'), false);
  equal(paymentMatch(e, 'PAY1234ABCD5678', 2000000, '9999'), false);
});
test('Vietnam payroll month boundaries handle short months and year rollover', () => {
  const feb = periodBounds('2026-02');
  equal(feb.start.toISOString(), '2026-01-31T17:00:00.000Z');
  equal(feb.end.toISOString(), '2026-02-28T17:00:00.000Z');
  const dec = periodBounds('2026-12');
  equal(dec.end.toISOString(), '2026-12-31T17:00:00.000Z');
});
