import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveTemplateDialog } from '../SaveTemplateDialog';
import { TemplatePicker } from '../TemplatePicker';
import type { SessionTemplate } from '../sessionTemplate';

const choices = { model: 'opus', inputMode: 'plan', effort: 'high' };

describe('SaveTemplateDialog', () => {
  const renderDialog = (over: Partial<Parameters<typeof SaveTemplateDialog>[0]> = {}) => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<SaveTemplateDialog choices={choices} existingNames={['review']} saving={false} failed={false} onSave={onSave} onCancel={onCancel} {...over} />);
    return { onSave, onCancel, input: screen.getByRole('textbox') };
  };

  it('shows what the template will keep', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Opus');
    expect(dialog.textContent).toContain('Plan mode');
    expect(dialog.textContent).toContain('High');
  });

  it('saves the trimmed name with Enter, and not an empty one', () => {
    const { onSave, input } = renderDialog();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  careful  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('careful');
  });

  it('says a taken name replaces that template, before anything is saved', () => {
    const { input } = renderDialog();
    fireEvent.change(input, { target: { value: 'review' } });
    expect(screen.getByText(/Replaces the template "review"/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });

  it('says when the save was refused', () => {
    renderDialog({ failed: true });
    expect(screen.getByText('Could not save the template.')).toBeTruthy();
  });
});

describe('TemplatePicker', () => {
  const templates: SessionTemplate[] = [
    { name: 'review', model: 'opus', inputMode: 'plan', effort: 'high', updatedAt: 1 },
    { name: 'quick', model: 'haiku', inputMode: null, effort: null, updatedAt: 2 },
  ];

  it('lists each template with what it sets, picks one and deletes one', () => {
    const onPick = vi.fn();
    const onDelete = vi.fn();
    render(<TemplatePicker templates={templates} loading={false} failed={false} onPick={onPick} onDelete={onDelete} onCancel={() => {}} />);

    expect(screen.getByText('Opus · Plan mode · High')).toBeTruthy();
    fireEvent.click(screen.getByText('quick'));
    expect(onPick).toHaveBeenCalledWith(templates[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete template review' }));
    expect(onDelete).toHaveBeenCalledWith(templates[0]);
  });

  it('says there are none yet, or that they could not be read', () => {
    const { rerender } = render(<TemplatePicker templates={[]} loading={false} failed={false} onPick={() => {}} onDelete={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/No templates yet/)).toBeTruthy();
    rerender(<TemplatePicker templates={[]} loading={false} failed onPick={() => {}} onDelete={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Could not read the templates.')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onCancel = vi.fn();
    render(<TemplatePicker templates={templates} loading={false} failed={false} onPick={() => {}} onDelete={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
