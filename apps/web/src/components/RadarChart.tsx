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
  // Wider than tall so the skill names fit beside the left/right corners.
  const width = 380;
  const height = 270;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 92;
  const n = Math.max(points.length, 3);

  const angleOf = (i: number): number => (Math.PI * 2 * i) / n - Math.PI / 2;
  const coord = (i: number, r: number): [number, number] => {
    const angle = angleOf(i);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
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
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t('analysis.radarTitle')}
        style={{
          display: 'block',
          margin: '0 auto',
          maxWidth: '100%',
          height: 'auto',
          overflow: 'visible',
        }}
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
          return <line key={p.label} x1={cx} y1={cy} x2={x} y2={y} stroke="#e1e6ee" />;
        })}
        {points.length >= 3 && (
          <polygon points={polygon} fill="rgba(31,95,219,0.25)" stroke="#1f5fdb" strokeWidth={2} />
        )}
        {points.map((p, i) => {
          const cos = Math.cos(angleOf(i));
          const sin = Math.sin(angleOf(i));
          const [x, y] = coord(i, radius + 12);
          const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
          const dy = sin > 0.25 ? '0.9em' : sin < -0.25 ? '-0.25em' : '0.35em';
          return (
            <text
              key={`label-${p.label}`}
              x={x}
              y={y}
              dy={dy}
              textAnchor={anchor}
              style={{ fill: 'var(--color-text-muted, #475569)', fontSize: 12 }}
            >
              {p.label}
            </text>
          );
        })}
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
