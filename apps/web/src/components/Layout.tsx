import type { Notification } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    enabled: !!user,
    refetchInterval: 15_000,
  });
  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          {t('common.appName')}
        </Link>
        <nav aria-label="primary">
          <Link to="/jobs">{t('nav.jobs')}</Link>
          <Link to="/companies">{t('nav.companies')}</Link>
          {user?.role === 'job_seeker' && (
            <>
              <Link to="/me">{t('nav.resume')}</Link>
              <Link to="/recommendations">{t('nav.recommendations')}</Link>
              <Link to="/applications">{t('nav.applications')}</Link>
            </>
          )}
          {user?.role === 'company_member' && (
            <>
              <Link to="/console">{t('nav.console')}</Link>
              <Link to="/talent">{t('nav.talent')}</Link>
              <Link to="/shortlist">{t('nav.shortlist')}</Link>
            </>
          )}
          {user && <Link to="/messages">{t('nav.messages')}</Link>}
          {user && (
            <Link to="/notifications">
              {t('nav.notifications')}
              {unread > 0 && (
                <span className="badge" aria-label={t('messaging.unread', { count: unread })}>
                  {' '}
                  {unread}
                </span>
              )}
            </Link>
          )}
        </nav>
        <span className="spacer" />
        <LanguageSwitcher />
        {user ? (
          <span className="row">
            <Link to="/settings">{t('nav.settings')}</Link>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              {t('nav.signOut')}
            </button>
          </span>
        ) : (
          <span className="row">
            <Link to="/login">{t('auth.signIn')}</Link>
            <Link to="/register">{t('auth.signUp')}</Link>
          </span>
        )}
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
