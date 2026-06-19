import { useEffect } from 'react';

/**
 * UI-5: warn the user before they lose unsaved form changes. Attaches a `beforeunload`
 * handler while `dirty` is true (covers tab close / reload / external navigation). In-app
 * route changes are guarded per-form by disabling submit while saving and by explicit
 * confirm dialogs on destructive actions.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to trigger the native prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
