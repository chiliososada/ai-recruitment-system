import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Home(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <section className="stack">
      <div className="card">
        <h1>{t('common.appName')}</h1>
        <p className="muted">{t('home.tagline')}</p>
        {!user && (
          <div className="row">
            <Link to="/register">
              <button type="button">{t('home.getStarted')}</button>
            </Link>
            <Link to="/jobs">
              <button type="button" className="secondary">
                {t('nav.jobs')}
              </button>
            </Link>
          </div>
        )}
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h2>{t('home.seekerCta')}</h2>
          <p className="muted">{t('analysis.none')}</p>
          <Link to={user?.role === 'job_seeker' ? '/me' : '/register'}>{t('nav.resume')} →</Link>
        </div>
        <div className="card">
          <h2>{t('home.companyCta')}</h2>
          <p className="muted">{t('match.candidates.empty')}</p>
          <Link to={user?.role === 'company_member' ? '/console' : '/register'}>{t('nav.console')} →</Link>
        </div>
      </div>
    </section>
  );
}
