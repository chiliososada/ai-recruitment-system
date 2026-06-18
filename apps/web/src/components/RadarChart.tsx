import { useTranslation } from 'react-i18next';

export interface RadarPoint {
  label: string;
  /** 0..1 */
  value: number;
}

/**
 * Accessible skill radar. The SVG is decorative (aria-hidden); the authoritative,
 * screen-reader-friendly representation is the adjacent text list (FR-03.3 / §8 radar
 * must have a text equivalent).
 */
export function RadarChart({ points }: { points: RadarPoint[] }): JSX.Element {
  const { t } = useTranslation();
  const size = 240;
  const center = size / 2;
  const radius = center - 28;
  const n = Math.max(points.length, 3);

  const coord = (i: number, r: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [center + r * Math.cos(angle) * (r === radius ? 1 : 1), center + r * Math.sin(angle)];
  };
  const polygon = points
    .map((p, i) => {
      const [x, y] = coord(i, radius * Math.max(0, Math.min(1, p.value)));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={t('analysis.radarTitle')}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={points
              .map((_, i) => {
                const [x, y] = coord(i, radius * ring);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(' ')}
            fill="none"
            stroke="#e1e6ee"
          />
        ))}
        {points.map((p, i) => {
          const [x, y] = coord(i, radius);
          return <line key={p.label} x1={center} y1={center} x2={x} y2={y} stroke="#e1e6ee" />;
        })}
        {points.length >= 3 && (
          <polygon points={polygon} fill="rgba(31,95,219,0.25)" stroke="#1f5fdb" strokeWidth={2} />
        )}
      </svg>
      <p className="visually-hidden">{t('analysis.radarTextAlt')}</p>
      <ul className="list-reset" data-testid="radar-text">
        {points.map((p) => (
          <li key={p.label} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{p.label}</span>
            <span className="muted">{Math.round(p.value * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
