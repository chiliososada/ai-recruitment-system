import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icons, ScoreRing } from '../design';
import { useAuth } from '../lib/auth';

export default function Home(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const primaryTo = user ? (user.role === 'job_seeker' ? '/me' : '/console') : '/register';

  return (
    <div className="stack" style={{ maxWidth: 1120, margin: '0 auto' }}>
      {/* ---- hero ---- */}
      <section className="hero">
        <div>
          <span className="hero-eyebrow">
            <Icons.Sparkles size={15} aria-hidden="true" />
            {t('home.heroEyebrow')}
          </span>
          <h1 className="hero-title">
            {t('home.heroTitle1')}
            <span className="grad-text">{t('home.heroAccent')}</span>
          </h1>
          <p className="hero-sub">{t('home.heroSub')}</p>
          <div className="row">
            <Link to={primaryTo} className="ui-btn">
              {t('home.getStarted')}
              <Icons.ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/jobs" className="ui-btn secondary">
              {t('nav.jobs')}
            </Link>
          </div>
          <div className="hero-props">
            {(
              [
                ['propAnalysisT', 'propAnalysisD'],
                ['propScoreT', 'propScoreD'],
                ['propLangT', 'propLangD'],
              ] as const
            ).map(([tt, dd]) => (
              <div className="hero-prop" key={tt}>
                <b>{t(`home.${tt}`)}</b>
                <span>{t(`home.${dd}`)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="blob" />
          <div className="float-card a">
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <ScoreRing value={92} size={56} />
              <div>
                <b>Full-Stack Engineer</b>
                <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  Acme Robotics · Tokyo
                </div>
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <span className="tag">TypeScript</span>
              <span className="tag">React</span>
              <span className="tag">Node.js</span>
              <span className="tag ok">AWS</span>
            </div>
          </div>
          <div className="float-card b">
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <span className="icon-chip teal">
                <Icons.FileText size={20} />
              </span>
              <div>
                <b>{t('home.propAnalysisT')}</b>
                <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {t('home.propAnalysisD')}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <span className="tag">PostgreSQL</span>
              <span className="tag">Docker</span>
              <span className="tag">CI/CD</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- features ---- */}
      <section style={{ paddingTop: 'var(--space-8)' }}>
        <p className="section-eyebrow">{t('home.heroEyebrow')}</p>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>
          {t('home.featuresTitle')}
        </h2>
        <div className="grid cols-3">
          {(
            [
              ['feature1T', 'feature1D', <Icons.FileText key="i" size={22} />, ''],
              ['feature2T', 'feature2D', <Icons.Sparkles key="i" size={22} />, 'violet'],
              ['feature3T', 'feature3D', <Icons.Briefcase key="i" size={22} />, 'teal'],
            ] as const
          ).map(([tt, dd, icon, tone]) => (
            <article className="card card-hover" key={tt}>
              <span className={`icon-chip ${tone}`} style={{ marginBottom: 'var(--space-3)' }}>
                {icon}
              </span>
              <h3>{t(`home.${tt}`)}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {t(`home.${dd}`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section style={{ paddingTop: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>
          {t('home.stepsTitle')}
        </h2>
        <div className="grid cols-3">
          {(
            [
              ['1', 'step1T', 'step1D'],
              ['2', 'step2T', 'step2D'],
              ['3', 'step3T', 'step3D'],
            ] as const
          ).map(([n, tt, dd]) => (
            <div className="card" key={n}>
              <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                <span className="step-num">{n}</span>
                <h3 style={{ margin: 0 }}>{t(`home.${tt}`)}</h3>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {t(`home.${dd}`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- role cards (existing quick links) ---- */}
      <section className="grid cols-2" style={{ paddingTop: 'var(--space-4)' }}>
        <article className="card card-hover">
          <span className="icon-chip" style={{ marginBottom: 'var(--space-3)' }}>
            <Icons.Users size={22} />
          </span>
          <h3>{t('home.seekerCta')}</h3>
          <p className="muted">{t('analysis.none')}</p>
          <Link to={user?.role === 'job_seeker' ? '/me' : '/register'}>{t('nav.resume')} →</Link>
        </article>
        <article className="card card-hover">
          <span className="icon-chip violet" style={{ marginBottom: 'var(--space-3)' }}>
            <Icons.Building2 size={22} />
          </span>
          <h3>{t('home.companyCta')}</h3>
          <p className="muted">{t('match.candidates.empty')}</p>
          <Link to={user?.role === 'company_member' ? '/console' : '/register'}>
            {t('nav.console')} →
          </Link>
        </article>
      </section>

      {/* ---- CTA band ---- */}
      {!user && (
        <section className="cta-band">
          <h2>{t('home.ctaTitle')}</h2>
          <p>{t('home.ctaSub')}</p>
          <Link to="/register" className="ui-btn inverse">
            {t('home.getStarted')}
            <Icons.ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
