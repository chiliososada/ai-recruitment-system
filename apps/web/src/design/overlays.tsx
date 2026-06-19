import * as RDialog from '@radix-ui/react-dialog';
import * as RDropdown from '@radix-ui/react-dropdown-menu';
import * as RTabs from '@radix-ui/react-tabs';
import * as RTooltip from '@radix-ui/react-tooltip';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from './primitives';

/** Accessible modal dialog (Radix: focus trap + restore, Esc, scroll lock). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  footer,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  trigger?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <RDialog.Trigger asChild>{trigger}</RDialog.Trigger> : null}
      <RDialog.Portal>
        <RDialog.Overlay className="ui-overlay" />
        <RDialog.Content className="ui-dialog">
          <div
            className="row"
            style={{ justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}
          >
            <RDialog.Title asChild>
              <h2 style={{ margin: 0 }}>{title}</h2>
            </RDialog.Title>
            <RDialog.Close asChild>
              <IconButton variant="ghost" label={t('common.close')}>
                <X size={18} aria-hidden="true" />
              </IconButton>
            </RDialog.Close>
          </div>
          {description ? (
            <RDialog.Description className="muted">{description}</RDialog.Description>
          ) : (
            <VisuallyHidden>
              <RDialog.Description>{title}</RDialog.Description>
            </VisuallyHidden>
          )}
          {children}
          {footer ? (
            <div
              className="row"
              style={{ justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}
            >
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={trigger}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    />
  );
}

export interface DropdownItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
}

export function Dropdown({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
}): JSX.Element {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{trigger}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content className="ui-menu" sideOffset={4} align="end">
          {items.map((item) => (
            <RDropdown.Item key={item.label} className="ui-menu-item" onSelect={item.onSelect}>
              {item.icon}
              {item.label}
            </RDropdown.Item>
          ))}
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}

export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <RTooltip.Provider delayDuration={300}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content className="ui-tooltip" sideOffset={4}>
            {content}
            <RTooltip.Arrow />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

export function Tabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
  defaultValue?: string;
}): JSX.Element {
  return (
    <RTabs.Root defaultValue={defaultValue ?? tabs[0]?.value}>
      <RTabs.List className="ui-tabs-list">
        {tabs.map((tab) => (
          <RTabs.Trigger key={tab.value} value={tab.value} className="ui-tab">
            {tab.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {tabs.map((tab) => (
        <RTabs.Content key={tab.value} value={tab.value}>
          {tab.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
