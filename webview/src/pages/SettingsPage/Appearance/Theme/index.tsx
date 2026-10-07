import { SettingSection } from '../../common';
import { ColorThemeRow } from './ColorThemeRow';
import { FontSizeRow } from './FontSizeRow';
import { FontFileRow } from './FontFileRow';
import { FontFileKind } from '@/utils/fontFiles';
import { LineSpacingRow } from './LineSpacingRow';
import { SoftWrapRow } from './SoftWrapRow';

/**
 * How the interface looks: its colours, its type, and how long lines behave.
 *
 * Untitled, because the page's own heading already says Appearance and a
 * subtitle repeating it would add a line without adding a distinction.
 */
export function ThemeSection() {
  return (
    <SettingSection>
      <ColorThemeRow />
      <FontSizeRow />
      <FontFileRow kind={FontFileKind.TEXT} />
      <FontFileRow kind={FontFileKind.CODE} />
      <LineSpacingRow />
      <SoftWrapRow />
    </SettingSection>
  );
}
