import type { Notification } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppShell,
  Badge,
  Button,
  Dropdown,
  Icons,
  MobileNav,
  Sidebar,
  Topbar,
  UserAvatar,
  type NavItem,
} from '../design';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';

const ICON = 18;

function useNavItems(role: 'job_seeker' | 'company_member' | undefined): NavItem[] {
  const { t } = useTranslation();
  if (role === 'job_seeker') {
    return [
      { to: '/me', label: t('nav.resume'), icon: <Icons.FileText size={ICON} /> },
      {
        to: '/recommendations',
        label: t('nav.recommendations'),
        icon: <Icons.Sparkles size={ICON} />,
      },
      { to: '/applications', label: t('nav.applications'), icon: <Icons.Briefcase size={ICON} /> },
      { to: '/jobs', label: t('nav.jobs'), icon: <Icons.Briefcase size={ICON} /> },
      { to: '/companies', label: t('nav.companies'), icon: <Icons.Building2 size={ICON} /> },
      { to: '/messages', label: t('nav.messages'), icon: <Icons.MessageSquare size={ICON} /> },
    ];
  }
  if (role === 'company_member') {
    return [
      { to: '/console', label: t('nav.console'), icon: <Icons.LayoutDashboard size={ICON} /> },
      { to: '/talent', label: t('nav.talent'), icon: <Icons.Users size={ICON} /> },
      { to: '/shortlist', label: t('nav.shortlist'), icon: <Icons.Star size={ICON} /> },
      { to: '/jobs', label: t('nav.jobs'), icon: <Icons.Briefcase size={ICON} /> },
      { to: '/companies', label: t('nav.companies'), icon: <Icons.Building2 size={ICON} /> },
      { to: '/messages', label: t('nav.messages'), icon: <Icons.MessageSquare size={ICON} /> },
    ];
  }
  return [
    { to: '/jobs', label: t('nav.jobs'), icon: <Icons.Briefcase size={ICON} /> },
    { to: '/companies', label: t('nav.companies'), icon: <Icons.Building2 size={ICON} /> },
  ];
}

function NotificationsBell(): JSX.Element {
  const { t } = useTranslation();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    refetchInterval: 15_000,
  });
  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;
  return (
    <Link
      to="/notifications"
      className="ui-btn ghost ui-icon-btn"
      aria-label={t('notification.title')}
      style={{ position: 'relative' }}
    >
      <Icons.Bell size={ICON} aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-label={t('messaging.unread', { count: unread })}
          style={{ position: 'absolute', top: -4, right: -4 }}
        >
          <Badge tone="danger">{unread}</Badge>
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu(): JSX.Element {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return <></>;
  return (
    <Dropdown
      trigger={
        <button type="button" className="ui-btn ghost" aria-label={user.displayName}>
          <UserAvatar name={user.displayName} />
        </button>
      }
      items={[
        {
          label: t('nav.settings'),
          icon: <Icons.Settings size={16} />,
          onSelect: () => navigate('/settings'),
        },
        {
          label: t('nav.signOut'),
          icon: <Icons.LogOut size={16} />,
          onSelect: () => {
            logout();
            navigate('/');
          },
        },
      ]}
    />
  );
}

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = useNavItems(user?.role);

  const brand = (
    <Link
      to="/"
      style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
    >
      <Icons.Sparkles size={20} aria-hidden="true" /> {t('common.appName')}
    </Link>
  );

  const skipLink = (
    <a href="#main-content" className="visually-hidden">
      {t('common.skipToContent', { defaultValue: 'Skip to content' })}
    </a>
  );

  if (!user) {
    // Public / auth shell: simple top navigation.
    return (
      <div
        className="app-shell"
        style={{ gridTemplateColumns: '1fr', gridTemplateAreas: "'topbar' 'main'" }}
      >
        {skipLink}
        <Topbar>
          <span className="brand" style={{ padding: 0 }}>
            {brand}
          </span>
          <nav className="row app-public-nav" aria-label="primary">
            <Link to="/jobs" className="app-nav-link">
              {t('nav.jobs')}
            </Link>
            <Link to="/companies" className="app-nav-link">
              {t('nav.companies')}
            </Link>
          </nav>
          <span className="spacer" />
          <LanguageSwitcher />
          <Button asChild variant="secondary">
            <Link to="/login">{t('auth.signIn')}</Link>
          </Button>
          <Button asChild>
            <Link to="/register">{t('auth.signUp')}</Link>
          </Button>
        </Topbar>
        <main className="app-main" id="main-content">
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    );
  }

  return (
    <>
      {skipLink}
      <AppShell
        sidebar={<Sidebar brand={brand} items={items} />}
        topbar={
          <Topbar>
            <MobileNav items={items} label={t('nav.home')} />
            <span className="spacer" />
            <LanguageSwitcher />
            <NotificationsBell />
            <UserMenu />
          </Topbar>
        }
      >
        {children}
      </AppShell>
    </>
  );
}
