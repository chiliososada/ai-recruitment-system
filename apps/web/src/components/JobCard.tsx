import type { Job } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icons, InitialAvatar } from '../design';

/** Rich job card: company mark, meta row with icons, skills and salary. */
export function JobCard({ job }: { job: Job }): JSX.Element {
  const { t } = useTranslation();
  const hasSalary = job.salaryMin != null || job.salaryMax != null;
  return (
    <article className="card" data-testid="job-card">
      <div
        className="row"
        style={{ gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
      >
        <InitialAvatar name={job.companyName ?? job.title} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
            <Link to={`/jobs/${job.id}`}>{job.title}</Link>
          </h2>
          <div className="meta-row" style={{ marginTop: 4 }}>
            {job.companyName ? (
              <span className="meta-item">
                <Icons.Building2 size={14} aria-hidden="true" />
                {job.companyName}
              </span>
            ) : null}
            <span className="meta-item">
              <Icons.Laptop size={14} aria-hidden="true" />
              {t(`job.workStyleValue.${job.workStyle}`)}
            </span>
            {job.location ? (
              <span className="meta-item">
                <Icons.MapPin size={14} aria-hidden="true" />
                {job.location}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        {job.requiredSkills.slice(0, 5).map((s) => (
          <span key={s} className="tag">
            {s}
          </span>
        ))}
        {job.preferredSkills.slice(0, 2).map((s) => (
          <span key={s} className="tag plain">
            {s}
          </span>
        ))}
      </div>
      {hasSalary ? (
        <div
          className="meta-item"
          style={{
            marginTop: 'var(--space-2)',
            color: 'var(--color-text)',
            fontWeight: 'var(--weight-semibold)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <Icons.Banknote size={15} aria-hidden="true" />
          {(job.salaryMin ?? 0).toLocaleString()} – {(job.salaryMax ?? 0).toLocaleString()}{' '}
          {job.currency}
        </div>
      ) : null}
    </article>
  );
}
