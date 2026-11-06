'use client';

import { useState } from 'react';
import { useData, Loading, PageTitle, Form, Table, FileLink } from './ui';
import { api, when } from '../lib/api';
const metrics = ['IELTS_LISTENING', 'IELTS_READING', 'IELTS_WRITING', 'IELTS_SPEAKING', 'IELTS_OVERALL', 'SAT_MATH', 'SAT_RW', 'SAT_TOTAL', 'PERCENT'];
export default function Progress({
  studentId = null
}) {
  const [selected, setSelected] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [score, setScore] = useState(null);
  const params = new URLSearchParams();
  if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
  if (to) { const end = new Date(to + 'T00:00:00'); end.setDate(end.getDate() + 1); params.set('to', end.toISOString()); }
  const state = useData((studentId ? '/teacher/students/' + studentId + '/progress' : '/student/progress') + '?' + params);
  const detail = useData(score ? (studentId ? '/teacher/students/' + studentId + '/assessments/' : '/student/progress/') + score : null);
  const {
      scores,
      targets
    } = state.data || {scores:[],targets:[]},
    options = [...new Set([...scores.map(x => x.metric_code), ...targets.map(x => x.metric_code)])],
    metric = selected || options[0] || '',
    rows = scores.filter(x => x.metric_code === metric),
    target = targets.find(x => x.metric_code === metric)?.target_value,
    max = Math.max(1, ...rows.map(x => Number(x.max_value)), Number(target) || 0),
    width = 800,
    height = 260,
    left = 50,
    right = 30,
    top = 25,
    bottom = 45;
  const x = i => left + (rows.length > 1 ? i / (rows.length - 1) : .5) * (width - left - right),
    y = v => height - bottom - Number(v) / max * (height - top - bottom),
    points = rows.map((r, i) => `${x(i)},${y(r.score_value)}`).join(' ');
  return <><PageTitle title="Tiến độ học tập" subtitle="Mỗi biểu đồ chỉ hiển thị một chỉ số và một thang điểm."><button onClick={() => window.print()}>In báo cáo</button></PageTitle><section className="card inline"><label>Từ ngày<input type="date" value={from} onChange={e => {setFrom(e.target.value);setScore(null);}} /></label><label>Đến hết ngày<input type="date" value={to} onChange={e => {setTo(e.target.value);setScore(null);}} /></label><button onClick={() => {setFrom('');setTo('');setScore(null);}}>Xóa bộ lọc</button></section>{!state.data ? <Loading {...state} /> : <section className="card"><div className="inline"><label>Chỉ số <select value={metric} onChange={e => setSelected(e.target.value)}>{options.map(m => <option key={m}>{m}</option>)}</select></label><span className="muted">Mục tiêu: {target ?? 'Chưa đặt'}</span></div>{rows.length ? <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={'Biểu đồ tiến bộ ' + metric}>{[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={left} x2={width - right} y1={y(max * f)} y2={y(max * f)} stroke="#e5ebf5" /><text x={left - 10} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#7a889b">{(max * f).toFixed(max <= 9 ? 1 : 0)}</text></g>)}{target != null && <line x1={left} x2={width - right} y1={y(target)} y2={y(target)} stroke="#d69a3d" strokeDasharray="6 5" />}<polyline points={points} fill="none" stroke="#2456c1" strokeWidth="3" />{rows.map((r, i) => <g key={r.score_id}><circle cx={x(i)} cy={y(r.score_value)} r="4" fill="#2456c1" /><title>{r.label + ': ' + r.score_value}</title>{(rows.length < 8 || i === 0 || i === rows.length - 1) && <text x={x(i)} y={height - 15} textAnchor="middle" fontSize="10" fill="#7a889b">{new Date(r.assessment_date).toLocaleDateString('vi-VN')}</text>}</g>)}</svg> : <p className="empty">Chưa có kết quả cho chỉ số này.</p>}{rows.length === 1 && <p className="muted">Mới có một kết quả; chưa đủ dữ liệu để kết luận xu hướng.</p>}<Table rows={rows} columns={[{
        key: 'assessment_date',
        label: 'Ngày',
        render: r => when(r.assessment_date)
      }, {
        key: 'label',
        label: 'Bài đánh giá'
      }, {
        key: 'score_value',
        label: 'Kết quả',
        render: r => r.score_value + '/' + r.max_value
      }, {key:'detail',label:'Chi tiết',render:r => <button onClick={() => setScore(r.score_id)}>Xem điểm & phản hồi</button>}]} /></section>}{score && <section className="card"><h2>Chi tiết đánh giá</h2><button onClick={() => setScore(null)}>Đóng chi tiết</button>{!detail.data ? <Loading {...detail} /> : <><h3>{detail.data.assessment.label}</h3><p>{detail.data.assessment.metric_code}: {detail.data.assessment.score_value}/{detail.data.assessment.max_value}</p>{detail.data.submission && <><p style={{whiteSpace:'pre-wrap'}}>{detail.data.submission.text_content}</p><p>Phản hồi: {detail.data.submission.feedback || 'Chưa có'}</p><FileLink id={detail.data.submission.file_id} />{detail.data.submission.external_url && <a href={detail.data.submission.external_url} target="_blank" rel="noreferrer">Liên kết bài nộp</a>}</>}<Table rows={detail.data.answers} columns={[{key:'prompt',label:'Câu hỏi'},{key:'answer_text',label:'Bài làm'},{key:'points_awarded',label:'Điểm'},{key:'feedback',label:'Phản hồi'},{key:'file_id',label:'File',render:r => <FileLink id={r.file_id} />}]} /></>}</section>}{studentId && <section className="card"><h2>Mục tiêu học tập</h2><Form fields={[{
        name: 'metric_code',
        label: 'Chỉ số',
        options: metrics,
        required: true
      }, {
        name: 'target_value',
        label: 'Điểm mục tiêu',
        type: 'number',
        required: true
      }]} submit={body => api('/teacher/students/' + studentId + '/target', {
        method: 'PUT',
        body
      })} onDone={state.reload} /></section>}</>;
}
