import { useEffect, useState } from 'react';
import type { Conversation, Message } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, Loading } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

export default function Messages(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [active, setActive] = useState<string | null>(params.get('c'));
  const [draft, setDraft] = useState('');

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/conversations'),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!active && conversations.data && conversations.data.length > 0) {
      setActive(conversations.data[0]!.id);
    }
  }, [active, conversations.data]);

  const messages = useQuery({
    queryKey: ['messages', active],
    queryFn: () => api.get<Message[]>(`/conversations/${active}/messages`),
    enabled: !!active,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      api.post<Message>(`/conversations/${active}/messages`, {
        body,
        clientToken: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['messages', active] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <section className="grid cols-2">
      <div className="card">
        <h1>{t('messaging.conversations')}</h1>
        {conversations.isLoading ? (
          <Loading />
        ) : (conversations.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('messaging.noConversations')} />
        ) : (
          <ul className="list-reset stack">
            {conversations.data!.map((c) => {
              const other = c.members.find((m) => m.userId !== user?.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="ghost"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      height: 'auto',
                      padding: 'var(--space-2) var(--space-3)',
                      justifyContent: 'flex-start',
                      background: active === c.id ? 'var(--color-primary-soft)' : undefined,
                      borderRadius: 'var(--radius-md)',
                    }}
                    onClick={() => setActive(c.id)}
                  >
                    <InitialAvatar name={other?.displayName ?? '?'} round />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        className="row"
                        style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}
                      >
                        <strong style={{ color: 'var(--color-text)' }}>
                          {other?.displayName ?? c.subject ?? t('messaging.title')}
                        </strong>
                        {c.unreadCount > 0 ? (
                          <span className="ui-badge danger">{c.unreadCount}</span>
                        ) : null}
                      </span>
                      <span
                        className="muted"
                        style={{
                          display: 'block',
                          fontSize: 'var(--text-sm)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: 'var(--weight-regular)',
                        }}
                      >
                        {c.lastMessagePreview ?? ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card stack">
        <h2>{t('messaging.title')}</h2>
        {!active ? (
          <EmptyState message={t('messaging.empty')} />
        ) : (
          <>
            <div
              data-testid="message-list"
              style={{
                minHeight: 260,
                maxHeight: '55vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                padding: 'var(--space-2)',
              }}
            >
              {(messages.data ?? []).map((m) => (
                <div key={m.id} className={m.senderUserId === user?.id ? 'msg mine' : 'msg'}>
                  {m.senderUserId !== user?.id ? (
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {m.senderName}
                    </div>
                  ) : null}
                  {m.body}
                </div>
              ))}
              {(messages.data?.length ?? 0) === 0 ? (
                <EmptyState message={t('messaging.empty')} />
              ) : null}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) send.mutate(draft.trim());
              }}
            >
              <label htmlFor="draft" className="visually-hidden">
                {t('messaging.newMessage')}
              </label>
              <input
                id="draft"
                placeholder={t('messaging.newMessage')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" disabled={send.isPending || !draft.trim()}>
                {send.isPending ? t('messaging.sending') : t('messaging.send')}
                <Icons.ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>
            {send.error ? (
              <div className="field-error" role="alert">
                {t('messaging.failed')}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
