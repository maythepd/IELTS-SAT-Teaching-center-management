'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, setSession } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Shell({
  children,
  publicPage = false
}) {
  const [user, setUser] = useState(null),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const path = usePathname(),
    router = useRouter(),
    { lang, t, toggle, isEn } = useLang();

  useEffect(() => {
    let alive = true;
    api('/auth/me').then(u => {
      if (alive) {
        setUser(u);
        setSession(u);
        setLoaded(true);
      }
    }).catch(e => {
      if (!alive) return;
      if (e.status === 401) {
        setLoaded(true);
        if (!publicPage) router.replace('/login');
      } else {
        setError(e.message);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [publicPage, router]);

  useEffect(() => {
    const listener = e => setMessage(e.detail);
    window.addEventListener('app-notice', listener);
    return () => window.removeEventListener('app-notice', listener);
  }, []);

  const getMenuItems = (role) => {
    switch (role) {
      case 'STUDENT':
        return [
          [t('Tổng quan'), '/student'],
          [t('Khám phá khóa học'), '/courses'],
          [t('Lớp của tôi'), '/student/classes'],
          [t('Đăng ký & học phí'), '/student/enrollments'],
          [t('Kết quả bài tập'), '/student/results'],
          [t('Tiến độ học tập'), '/student/progress'],
          [t('Lịch học'), '/student/schedule'],
          [t('Luyện thi'), '/student/tests'],
          [t('Lịch sử thi'), '/student/attempts']
        ];
      case 'TEACHER':
        return [
          [t('Trang chủ'), '/teacher'],
          [t('Lớp phụ trách'), '/teacher/classes'],
          [t('Khóa học'), '/teacher/courses'],
          [t('Lịch dạy'), '/teacher/schedule'],
          [t('Luyện thi'), '/teacher/tests'],
          [t('Thu nhập'), '/teacher/income']
        ];
      case 'MANAGER':
        return [
          [t('Tổng quan'), '/manager'],
          [t('Tài khoản & quyền'), '/manager/accounts'],
          [t('Khóa học & lớp'), '/manager/courses'],
          [t('Ghi danh'), '/manager/enrollments'],
          [t('Học phí'), '/manager/payments'],
          [t('Bảng lương'), '/manager/payroll'],
          [t('Rate & bonus'), '/manager/rates'],
          [t('Lịch & buổi dạy'), '/manager/schedule'],
          [t('Luyện thi'), '/manager/tests'],
          [t('Trạng thái email'), '/manager/emails'],
          [t('Lịch sử thay đổi'), '/manager/audit'],
          [t('Sao lưu'), '/manager/maintenance']
        ];
      default:
        return [
          [t('Khám phá khóa học'), '/courses'],
          [t('Đăng nhập'), '/login'],
          [t('Đăng ký'), '/register']
        ];
    }
  };

  if (!loaded) return <p className="loading-page">Đang kiểm tra phiên đăng nhập…</p>;
  if (error) return (
    <div className="auth-card">
      <p className="error">{error}</p>
      <button onClick={() => location.reload()}>{t('Thử lại')}</button>
      <Link href="/login">{t('Đăng nhập')}</Link>
    </div>
  );
  if (!user && !publicPage) return null;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <nav>
          {getMenuItems(user?.role).map(([label, href]) => (
            <Link key={href} className={path === href ? 'active' : ''} href={href}>
              {label}
            </Link>
          ))}
          {user && <Link href="/profile">{t('Hồ sơ cá nhân')}</Link>}
        </nav>
        {user && (
          <button
            className="logout"
            onClick={async () => {
              if (!confirm(t('Bạn muốn đăng xuất?'))) return;
              try {
                await api('/auth/logout', { method: 'POST' });
                setSession(null);
                router.push('/login');
              } catch (e) {
                setMessage(e.message);
              }
            }}
          >
            {t('Đăng xuất')}
          </button>
        )}
        <div className="sidebar-foot">{t('Tên trung tâm')}</div>
      </aside>

      <div className="workspace-body">
        <header className="topbar">
          <span>{t('Tên trung tâm')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={toggle}
              title={isEn ? 'Chuyển sang tiếng Việt' : 'Switch to English'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="role-tag">{t(user?.role) || user?.role || t('Khách')}</span>
              <strong>{user?.full_name || t('Khách')}</strong>
            </div>
          </div>
        </header>

        <main key={lang}>
          {message && (
            <div className="notice" role="status">
              {message}
              <button onClick={() => setMessage('')}>×</button>
            </div>
          )}
          {typeof children === 'function' ? children(user) : children}
        </main>

        <footer>{t('Tên trung tâm')}</footer>
      </div>
    </div>
  );
}
