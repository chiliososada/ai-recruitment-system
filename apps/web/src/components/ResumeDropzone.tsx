import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALLOWED_RESUME_EXT } from '@ars/shared';

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
      role="button"
      tabIndex={0}
      aria-label={t('resume.dropHere')}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
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
        background: over ? '#eef4ff' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <p>{t('resume.dropHere')}</p>
      <button type="button" className="secondary" disabled={disabled} tabIndex={-1}>
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
