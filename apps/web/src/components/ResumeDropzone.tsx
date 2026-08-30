import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALLOWED_RESUME_EXT } from '@ars/shared';
import { Icons } from '../design';

export function ResumeDropzone({
  onSelect,
  disabled,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      aria-label={t('resume.dropHere')}
      data-testid="resume-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !disabled) onSelect(file);
      }}
      className="card"
      style={{
        textAlign: 'center',
        borderStyle: 'dashed',
        borderColor: over ? 'var(--color-primary)' : 'var(--color-border-strong)',
        borderWidth: 2,
        background: over ? 'var(--color-primary-soft)' : undefined,
        boxShadow: 'none',
        transition: 'border-color var(--duration-fast), background var(--duration-fast)',
      }}
    >
      <span className="icon-chip lg" style={{ margin: '0 auto var(--space-3)' }}>
        <Icons.Upload size={26} aria-hidden="true" />
      </span>
      <p style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-1)' }}>
        {t('resume.dropHere')}
      </p>
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        {t('resume.choose')}
      </button>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        {t('resume.hint')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_RESUME_EXT.join(',')}
        style={{ display: 'none' }}
        data-testid="resume-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
