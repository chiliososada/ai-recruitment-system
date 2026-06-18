import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ResumeDropzone } from './ResumeDropzone';

describe('ResumeDropzone (FR-02 upload interaction)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('invokes onSelect with the chosen file', () => {
    const onSelect = vi.fn();
    render(<ResumeDropzone onSelect={onSelect} />);
    const input = screen.getByTestId('resume-input');
    const file = new File(['hello'], 'cv.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(file);
  });

  it('supports drag-and-drop', () => {
    const onSelect = vi.fn();
    render(<ResumeDropzone onSelect={onSelect} />);
    const zone = screen.getByRole('button', { name: /drag/i });
    const file = new File(['hello'], 'cv.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onSelect).toHaveBeenCalledWith(file);
  });
});
