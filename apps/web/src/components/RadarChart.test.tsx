import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RadarChart } from './RadarChart';

describe('RadarChart (FR-03.3 — radar has a text equivalent)', () => {
  it('renders an accessible image plus a readable text table of skill levels', () => {
    render(
      <RadarChart
        points={[
          { label: 'TypeScript', value: 1 },
          { label: 'React', value: 0.85 },
          { label: 'Node.js', value: 0.65 },
        ]}
      />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
    const text = screen.getByTestId('radar-text');
    expect(within(text).getByText('TypeScript')).toBeInTheDocument();
    expect(within(text).getByText('100%')).toBeInTheDocument();
    expect(within(text).getByText('85%')).toBeInTheDocument();
  });
});
