import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n, { LOCALE_STORAGE_KEY } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { renderWithProviders } from '../test/utils';

describe('LanguageSwitcher (FR-09.4)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ja');
    localStorage.clear();
  });

  it('switches the active language and persists the choice', async () => {
    renderWithProviders(<LanguageSwitcher />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('ja');

    // zh-CN is lazy-loaded (code-split), so the switch resolves asynchronously.
    fireEvent.change(select, { target: { value: 'zh-CN' } });
    await waitFor(() => expect(i18n.language).toBe('zh-CN'));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');

    fireEvent.change(select, { target: { value: 'en' } });
    await waitFor(() => expect(i18n.language).toBe('en'));
  });

  it('offers all four supported locales', () => {
    renderWithProviders(<LanguageSwitcher />);
    expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '简体中文' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '繁體中文' })).toBeInTheDocument();
  });
});
