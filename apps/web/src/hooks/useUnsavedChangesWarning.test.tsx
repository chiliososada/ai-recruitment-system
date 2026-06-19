import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';

function Probe({ dirty }: { dirty: boolean }): null {
  useUnsavedChangesWarning(dirty);
  return null;
}

function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useUnsavedChangesWarning (UI-5)', () => {
  it('blocks unload while there are unsaved changes', () => {
    render(<Probe dirty />);
    expect(fireBeforeUnload()).toBe(true);
  });

  it('allows unload when the form is clean', () => {
    render(<Probe dirty={false} />);
    expect(fireBeforeUnload()).toBe(false);
  });

  it('stops blocking once changes are saved (dirty -> false)', () => {
    const { rerender } = render(<Probe dirty />);
    expect(fireBeforeUnload()).toBe(true);
    rerender(<Probe dirty={false} />);
    expect(fireBeforeUnload()).toBe(false);
  });
});
