'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setSession } from '../lib/api';
import { Form } from './ui';
import { useLang } from '../lib/i18n';

export default function Auth({
  mode
}) {
  const router = useRouter(),
    { lang, t, toggle, isEn } = useLang(),
    [challenge, setChallenge] = useState(''),
    [message, setMessage] = useState(''),
    [token, setToken] = useState('');

  useEffect(() => setToken(new URLSearchParams(location.search).get('token') || ''), []);

  const login = async result => {
    if (result.mfa_required) {
      setChallenge(result.challenge);
      setMessage(result.message);
      return;
    }
    setSession(result.user);
    router.push('/' + result.user.role.toLowerCase());
  };

  const titles = {
    login: t('Chào mừng trở lại'),
    register: t('Đăng ký tài khoản'),
    'forgot-password': t('Quên mật khẩu'),
    'reset-password': t('Đặt lại mật khẩu'),
    'verify-email': t('Xác nhận email')
  };

  return (
    <div className="auth-page" key={lang}>
      <div className="auth-story">
        <Link href="/courses" style={{ color: 'white', textDecoration: 'none' }}>
          <h1 style={{ margin: '0 0 14px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.25 }}>
            {t('Tên trung tâm')}
          </h1>
        </Link>
        <p style={{ margin: 0, color: '#c3d5f5', fontSize: 15, lineHeight: 1.6 }}>
          {t('Motto trung tâm')}
        </p>
      </div>

      <section className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            {t('Tên trung tâm')}
          </p>
          <button
            type="button"
            onClick={toggle}
            title={isEn ? 'Chuyển sang tiếng Việt' : 'Switch to English'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid #cfd8e6',
              borderRadius: 6,
              background: '#f8faff',
              cursor: 'pointer',
              color: 'var(--navy)'
            }}
          >
            🌐 {isEn ? 'Tiếng Việt' : 'English'}
          </button>
        </div>

        <h1>{titles[mode]}</h1>
        {message && <p className="notice">{message}</p>}

        {mode === 'login' ? (
          challenge ? (
            <Form
              key="mfa"
              fields={[
                {
                  name: 'code',
                  label: t('Mã xác thực từ email'),
                  required: true
                }
              ]}
              submit={b =>
                api('/auth/login/verify', {
                  method: 'POST',
                  body: {
                    ...b,
                    challenge
                  }
                })
              }
              label={t('Xác thực')}
              cancelHref="/courses"
              onDone={login}
            />
          ) : (
            <Form
              fields={[
                {
                  name: 'email',
                  label: t('Email'),
                  type: 'email',
                  required: true
                },
                {
                  name: 'password',
                  label: t('Mật khẩu'),
                  type: 'password',
                  required: true
                }
              ]}
              submit={b =>
                api('/auth/login', {
                  method: 'POST',
                  body: b
                })
              }
              label={t('Đăng nhập')}
              cancelHref="/courses"
              onDone={login}
            />
          )
        ) : mode === 'register' ? (
          <Form
            fields={[
              {
                name: 'full_name',
                label: t('Họ tên'),
                required: true
              },
              {
                name: 'email',
                label: t('Email'),
                type: 'email',
                required: true
              },
              {
                name: 'password',
                label: t('Mật khẩu (ít nhất 6 ký tự)'),
                type: 'password',
                minLength: 6,
                required: true
              },
              {
                name: 'role',
                label: t('Loại tài khoản (cần quản lý duyệt)'),
                options: ['STUDENT', 'TEACHER', 'MANAGER'],
                required: true
              }
            ]}
            submit={b => {
              if (!b.password || b.password.length < 6) {
                throw new Error(t('Mật khẩu cần ít nhất 6 ký tự.'));
              }
              return api('/auth/register', {
                method: 'POST',
                body: b
              });
            }}
            label={t('Đăng ký')}
            cancelHref="/courses"
            onDone={r => setMessage(r.message)}
          />
        ) : mode === 'forgot-password' ? (
          <Form
            fields={[
              {
                name: 'email',
                label: t('Email'),
                type: 'email',
                required: true
              }
            ]}
            submit={b =>
              api('/auth/forgot-password', {
                method: 'POST',
                body: b
              })
            }
            label={t('Gửi hướng dẫn')}
            cancelHref="/courses"
            onDone={r => setMessage(r.message)}
          />
        ) : mode === 'reset-password' ? (
          <Form
            key={token}
            initial={{
              token
            }}
            fields={[
              {
                name: 'token',
                label: t('Mã trong liên kết'),
                required: true
              },
              {
                name: 'password',
                label: t('Mật khẩu mới (ít nhất 6 ký tự)'),
                type: 'password',
                minLength: 6,
                required: true
              }
            ]}
            submit={b => {
              if (!b.password || b.password.length < 6) {
                throw new Error(t('Mật khẩu cần ít nhất 6 ký tự.'));
              }
              return api('/auth/reset-password', {
                method: 'POST',
                body: b
              });
            }}
            label={t('Đặt lại mật khẩu')}
            cancelHref="/courses"
            onDone={r => setMessage(r.message)}
          />
        ) : (
          <Form
            key={token}
            initial={{
              token
            }}
            fields={[
              {
                name: 'token',
                label: t('Mã xác nhận'),
                required: true
              }
            ]}
            submit={b =>
              api('/auth/verify-email', {
                method: 'POST',
                body: b
              })
            }
            label={t('Xác nhận')}
            cancelHref="/courses"
            onDone={r => setMessage(r.message)}
          />
        )}

        <div className="auth-links">
          <Link href="/login">{t('Đăng nhập')}</Link>
          <Link href="/register">{t('Đăng ký')}</Link>
          <Link href="/forgot-password">{t('Quên mật khẩu')}</Link>
        </div>
      </section>
    </div>
  );
}
