import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import JobsBrowse from './JobsBrowse';
import { mockFetch, renderWithProviders } from '../test/utils';

const job = {
  id: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  companyName: 'Acme',
  title: 'Backend Engineer',
  category: 'Engineering',
  description: 'desc',
  requiredSkills: ['TypeScript'],
  preferredSkills: [],
  minYears: 3,
  maxYears: null,
  salaryMin: null,
  salaryMax: null,
  currency: 'JPY',
  location: 'Tokyo',
  workStyle: 'hybrid',
  languages: [],
  status: 'open',
  visibility: 'public',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('JobsBrowse filtering (FR-07)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders filter controls and lists jobs from the API', async () => {
    mockFetch([{ match: '/jobs', body: { items: [job], page: 1, pageSize: 20, total: 1, totalPages: 1 } }]);
    renderWithProviders(<JobsBrowse />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Work style')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    });
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows an empty state when there are no jobs', async () => {
    mockFetch([{ match: '/jobs', body: { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 } }]);
    renderWithProviders(<JobsBrowse />);
    await waitFor(() => {
      expect(screen.getByText('No jobs found')).toBeInTheDocument();
    });
  });
});
