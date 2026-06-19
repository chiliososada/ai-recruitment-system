import * as RToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastTone = 'info' | 'success' | 'warning' | 'danger';
interface ToastItem {
  id: string;
  title: string;
  tone: ToastTone;
}
interface ToastApi {
  toast: (title: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((title: string, tone: ToastTone = 'info') => {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), title, tone }]);
  }, []);
  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      <RToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <RToast.Root
            key={item.id}
            className={`ui-alert ${item.tone}`}
            style={{ boxShadow: 'var(--shadow-md)' }}
            onOpenChange={(open) => {
              if (!open) setItems((prev) => prev.filter((x) => x.id !== item.id));
            }}
          >
            <RToast.Title>{item.title}</RToast.Title>
          </RToast.Root>
        ))}
        <RToast.Viewport
          style={{
            position: 'fixed',
            bottom: 'var(--space-4)',
            right: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            width: 'min(380px, calc(100vw - var(--space-8)))',
            maxWidth: '100vw',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            zIndex: 'var(--z-toast)' as unknown as number,
          }}
        />
      </RToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
