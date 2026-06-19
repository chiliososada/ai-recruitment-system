import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { Dialog } from './overlays';
import { Switch, TextField } from './form';
import { Button } from './primitives';
import { EmptyState, ErrorState } from './feedback';
import { ApiError } from '../lib/api';

describe('design system components (DS-2/DS-3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('Button: variant class + loading disables and marks busy', () => {
    const { rerender } = render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('danger');
    rerender(
      <Button variant="danger" loading>
        Delete
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('TextField: associates label, error and aria-invalid', () => {
    render(<TextField id="email" label="Email" error="Required" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('Switch: toggles via keyboard/click', () => {
    const onChange = vi.fn();
    render(<Switch id="s" checked={false} onCheckedChange={onChange} label="Open to work" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Dialog: opens from trigger with an accessible title and closes', async () => {
    render(
      <Dialog title="Confirm action" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Confirm action' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('EmptyState + ErrorState render with retry', () => {
    render(<EmptyState message="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(500, 'INTERNAL', undefined)} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
