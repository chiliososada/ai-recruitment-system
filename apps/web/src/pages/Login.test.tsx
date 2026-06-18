import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import Login from './Login';
import { mockFetch, renderWithProviders } from '../test/utils';

describe('Login form + error state (FR-01)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the form fields', () => {
    mockFetch([]);
    renderWithProviders(<Login />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a localized error when credentials are invalid', async () => {
    mockFetch([
      {
        match: '/auth/login',
        status: 401,
        body: { error: { code: 'UNAUTHORIZED', messageKey: 'auth.invalidCredentials', correlationId: 'x' } },
      },
    ]);
    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });
});
