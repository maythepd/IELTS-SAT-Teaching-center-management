'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { api, notice } from '../lib/api';
import { t } from '../lib/i18n';
export function useData(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    if (url) api(url).then(d => {
      if (active) setData(d);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [url, tick]);
  return {
    data,
    error,
    reload: () => setTick(t => t + 1)
  };
}
export function Loading({
  error,
  reload
}) {
  return <div className="card muted">{error ? <><p className="error">{error}</p><button onClick={reload}>{t('Thử lại')}</button></> : <p>{t('Đang tải dữ liệu…')}</p>}</div>;
}
export function Table({
  rows,
  columns,
  empty = 'Chưa có dữ liệu.'
}) {
  return <div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c.key}>{t(c.label)}</th>)}</tr></thead><tbody>{rows?.map((r, i) => <tr key={r.account_id || r.event_id || r.payment_id || r.submission_id || i}>{columns.map(c => <td key={c.key}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}</tr>)}</tbody></table>{!rows?.length && <p className="empty">{t(empty)}</p>}</div>;
}
export function Badge({
  value
}) {
  return <span className={'badge ' + (['SUCCESS', 'PAID', 'APPROVED', 'GRADED', 'ACTIVE', 'SENT'].includes(value) ? 'green' : ['FAILED', 'REJECTED', 'LOCKED'].includes(value) ? 'red' : '')}>{t(value) || t('Chưa ghi nhận')}</span>;
}
export function PageTitle({
  title,
  subtitle,
  children
}) {
  if (!children) return null;
  return <div className="page-heading" style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}><div>{children}</div></div>;
}
export function Action({
  children,
  work,
  onDone,
  className = ''
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return <span className="action"><button className={className} disabled={busy} onClick={async () => {
      setBusy(true);
      setError('');
      try {
        if (document.querySelector('[data-upload-busy="true"]')) throw new Error('Vui lòng chờ tải file hoặc ghi âm hoàn tất.');
        const r = await work();
        if (r?.message) notice(r.message);
        onDone?.(r);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }}>{busy ? t('Đang xử lý…') : children}</button>{error && <small className="error">{error}</small>}</span>;
}
export function Form({
  fields,
  initial = {},
  submit,
  label = 'Lưu',
  onDone,
  children,
  onValuesChange,
  cancelHref,
  cancelLabel = 'Quay lại'
}) {
  const [values, setValues] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    onValuesChange?.(values);
  }, [values]);
  return <form className="form" onSubmit={async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (document.querySelector('[data-upload-busy="true"]')) throw new Error('Vui lòng chờ tải file hoặc ghi âm hoàn tất.');
      const result = await submit(values);
      notice(result?.message || 'Đã lưu.');
      onDone?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }}>{fields.map(f => <label key={f.name} className={f.wide ? 'wide' : ''}><span>{t(f.label)}{f.required ? ' *' : ''}</span>{f.type === 'textarea' ? <textarea rows={f.rows || 4} value={values[f.name] ?? ''} required={f.required} onChange={e => setValues(v => ({
        ...v,
        [f.name]: e.target.value
      }))} /> : f.options ? <select multiple={!!f.multiple} value={values[f.name] ?? (f.multiple ? [] : '')} required={f.required} onChange={e => setValues(v => ({
        ...v,
        [f.name]: f.multiple ? Array.from(e.target.selectedOptions, x => x.value) : e.target.value
      }))}>{!f.multiple && <option value="">{t('Chọn…')}</option>}{f.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{t(o.label ?? o)}</option>)}</select> : f.type === 'file' ? <Upload onUpload={id => setValues(v => ({
        ...v,
        [f.name]: id
      }))} /> : <input type={f.type || 'text'} value={values[f.name] ?? ''} required={f.required} minLength={f.minLength} maxLength={f.maxLength} min={f.min} max={f.max} step={f.step || 'any'} onChange={e => setValues(v => ({
        ...v,
        [f.name]: e.target.value
      }))} />} {f.help && <small className="muted">{t(f.help)}</small>}</label>)}{children}{error && <p className="error wide" role="alert">{error}</p>}<div className="wide" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="primary" disabled={busy}>{busy ? t('Đang lưu…') : t(label)}</button>{cancelHref && <Link href={cancelHref} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', border: '1px solid #ccd7e9', borderRadius: 7, background: '#fff', color: 'var(--ink)', textDecoration: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{t(cancelLabel)}</Link>}</div></form>;
}
export function Upload({
  onUpload
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  return <div data-upload-busy={busy}><input type="file" disabled={busy} onChange={async e => {
      const file = e.target.files[0];
      if (!file) return;
      setBusy(true);
      setStatus('Đang tải…');
      try {
        const body = new FormData();
        body.append('file', file);
        const r = await api('/files', {
          method: 'POST',
          body
        });
        onUpload(r.file_id);
        setStatus('Đã tải: ' + file.name);
      } catch (err) {
        setStatus(err.message);
      } finally {
        setBusy(false);
      }
    }} /><small>{status || 'Tối đa 10 MB; tài liệu, ảnh hoặc ghi âm.'}</small></div>;
}
export function Recorder({
  onUpload
}) {
  const recorder = useRef(null),
    stream = useRef(null),
    [recording, setRecording] = useState(false),
    [status, setStatus] = useState('');
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
  }, []);
  return <div className="recorder" data-upload-busy={recording || status === 'Đang tải bản ghi…'}><button type="button" disabled={!recording && status === 'Đang tải bản ghi…'} onClick={async () => {
      if (recording) {
        recorder.current.stop();
        setRecording(false);
        return;
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Thu âm cần HTTPS hoặc localhost.');
        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        const chunks = [];
        recorder.current = new MediaRecorder(stream.current);
        recorder.current.ondataavailable = e => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.current.onstop = async () => {
          try {
            setStatus('Đang tải bản ghi…');
            const blob = new Blob(chunks, {
                type: recorder.current.mimeType || 'audio/webm'
              }),
              body = new FormData();
            body.append('file', blob, 'speaking.webm');
            const r = await api('/files', {
              method: 'POST',
              body
            });
            onUpload(r.file_id);
            setStatus('Đã lưu bản ghi.');
          } catch (e) {
            setStatus(e.message);
          } finally {
            stream.current?.getTracks().forEach(t => t.stop());
          }
        };
        recorder.current.start();
        setRecording(true);
        setStatus('Đang ghi âm…');
      } catch (e) {
        setStatus(e.message);
        stream.current?.getTracks().forEach(t => t.stop());
        setRecording(false);
      }
    }}>{recording ? 'Dừng ghi âm' : 'Ghi âm Speaking'}</button><small>{status}</small></div>;
}
export function FileLink({
  id
}) {
  return id ? <a href={'/api/files/' + id} target="_blank" rel="noreferrer">Mở / tải file</a> : null;
}
export function Tabs({
  items
}) {
  return <nav className="tabs">{items.map(x => <Link key={x.href} href={x.href}>{x.label}</Link>)}</nav>;
}
