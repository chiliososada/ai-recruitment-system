import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Dropdown, type DropdownItem } from './overlays';
import { IconButton } from './primitives';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export function AppShell({
  sidebar,
  topbar,
  children,
}: {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="app-shell">
      {sidebar}
      {topbar}
      <main className="app-main" id="main-content">
        {children}
      </main>
    </div>
  );
}

export function Sidebar({
  brand,
  items,
  footer,
}: {
  brand: ReactNode;
  items: NavItem[];
  footer?: ReactNode;
}): JSX.Element {
  return (
    <aside className="app-sidebar" aria-label="primary navigation">
      <div className="brand">{brand}</div>
      <nav className="stack" style={{ gap: 'var(--space-1)' }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
            end={item.to === '/'}
          >
            <span aria-hidden="true" style={{ display: 'inline-flex' }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      {footer}
    </aside>
  );
}

export function Topbar({ children }: { children: ReactNode }): JSX.Element {
  return <header className="app-topbar">{children}</header>;
}

export function MobileNav({ items, label }: { items: NavItem[]; label: string }): JSX.Element {
  const dropdownItems: DropdownItem[] = items.map((item) => ({
    label: item.label,
    icon: item.icon,
    onSelect: () => {
      window.location.assign(item.to);
    },
  }));
  return (
    <span className="app-mobilenav">
      <Dropdown
        trigger={
          <IconButton variant="ghost" label={label}>
            <Menu size={20} aria-hidden="true" />
          </IconButton>
        }
        items={dropdownItems}
      />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div
      className="page-header row"
      style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <div>
        <h1>{title}</h1>
        {description ? (
          <p className="muted" style={{ margin: 0 }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div
      className="row"
      style={{ justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}
    >
      <h2 style={{ margin: 0 }}>{title}</h2>
      {actions}
    </div>
  );
}
