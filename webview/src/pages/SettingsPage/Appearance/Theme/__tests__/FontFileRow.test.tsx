/** The Text Font and Code Font rows under Settings → Appearance. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';
import { resources } from '@/i18n/config';

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();
const sendMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};
let mockScope: 'global' | 'project' = 'global';

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    resetToGlobal: resetToGlobalMock,
    scope: mockScope,
  }),
}));
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send: sendMock }) }));

import { FontFileRow } from '../FontFileRow';
import { FontFileKind } from '@/utils/fontFiles';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
  sendMock.mockReset();
  mockScopeSettings = {};
  mockScope = 'global';
});

describe('FontFileRow', () => {
  it('saves a font path when focus leaves the field', () => {
    render(<FontFileRow kind={FontFileKind.CODE} />);
    const field = screen.getByRole('textbox', { name: 'Code Font' });

    fireEvent.change(field, { target: { value: ' /fonts/Mono.ttf ' } });
    fireEvent.blur(field);

    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.CODE_FONT_FILE, '/fonts/Mono.ttf');
  });

  it('answers a typo in place instead of saving it', () => {
    render(<FontFileRow kind={FontFileKind.TEXT} />);
    const field = screen.getByRole('textbox', { name: 'Text Font' });

    fireEvent.change(field, { target: { value: '/fonts/readme.txt' } });
    fireEvent.blur(field);

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a .ttf, .otf, .woff or .woff2 file.')).toBeTruthy();
  });

  it('puts the built-in font back when the field is emptied', () => {
    mockScopeSettings = { [SettingKey.TEXT_FONT_FILE]: '/fonts/Inter.ttf' };
    render(<FontFileRow kind={FontFileKind.TEXT} />);
    const field = screen.getByRole('textbox', { name: 'Text Font' });

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);

    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.TEXT_FONT_FILE, null);
  });

  it('in the project tab, an emptied field stops overriding instead', () => {
    mockScope = 'project';
    mockScopeSettings = { [SettingKey.TEXT_FONT_FILE]: '/fonts/Inter.ttf' };
    render(<FontFileRow kind={FontFileKind.TEXT} />);
    const field = screen.getByRole('textbox', { name: 'Text Font' });

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);

    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.TEXT_FONT_FILE);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('saves the file chosen in the picker', async () => {
    sendMock.mockResolvedValue({ paths: ['/Users/me/Library/Fonts/Mono.otf'] });
    render(<FontFileRow kind={FontFileKind.CODE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose…' }));

    await waitFor(() =>
      expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.CODE_FONT_FILE, '/Users/me/Library/Fonts/Mono.otf'),
    );
    expect(sendMock).toHaveBeenCalledWith(MessageType.PICK_FILES, { mode: 'files', multiple: false });
  });

  it('is translated in every locale, every reason included', () => {
    for (const locale of Object.keys(resources)) {
      const appearance = (resources[locale].settings as any).appearance;
      for (const kind of ['textFont', 'codeFont']) {
        expect(appearance?.theme?.[kind]?.label, `${locale} ${kind}`).toBeTruthy();
        expect(appearance?.theme?.[kind]?.description, `${locale} ${kind}`).toBeTruthy();
      }
      for (const key of ['builtIn', 'choose', 'loading', 'using']) {
        expect(appearance?.fontFile?.[key], `${locale} ${key}`).toBeTruthy();
      }
      for (const code of ['notAbsolute', 'unsupported', 'notFound', 'tooLarge', 'unreadable', 'invalid', 'failed']) {
        expect(appearance?.fontFile?.errors?.[code], `${locale} ${code}`).toBeTruthy();
      }
      expect(appearance?.fontFile?.using, locale).toContain('{{name}}');
    }
  });
});
