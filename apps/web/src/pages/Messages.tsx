import { useEffect, useState } from 'react';
import type { Conversation, Message } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, Loading } from '../components/ui';

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
      api.post<Message>(`/conversations/${active}/messages`, { body, clientToken: crypto.randomUUID() }),
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
                    className={active === c.id ? 'secondary' : 'ghost'}
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => setActive(c.id)}
                  >
                    <strong>{other?.displayName ?? c.subject ?? t('messaging.title')}</strong>
                    {c.unreadCount > 0 ? (
                      <span className="badge"> {t('messaging.unread', { count: c.unreadCount })}</span>
                    ) : null}
                    <div className="muted">{c.lastMessagePreview ?? ''}</div>
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
            <div data-testid="message-list" style={{ minHeight: 200, display: 'flex', flexDirection: 'column' }}>
              {(messages.data ?? []).map((m) => (
                <div key={m.id} className={m.senderUserId === user?.id ? 'msg mine' : 'msg'}>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                    {m.senderName}
                  </div>
                  {m.body}
                </div>
              ))}
              {(messages.data?.length ?? 0) === 0 ? <EmptyState message={t('messaging.empty')} /> : null}
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
              <input id="draft" placeholder={t('messaging.newMessage')} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="submit" disabled={send.isPending || !draft.trim()}>
                {send.isPending ? t('messaging.sending') : t('messaging.send')}
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
