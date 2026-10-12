import { useMemo } from 'react';
import { FileDiff, type FileContents } from '@pierre/diffs/react';
import { parseDiffFromFile } from '@pierre/diffs';
import { useThemeContext } from '@/contexts/ThemeContext';

interface Props {
  filePath: string;
  before: string;
  after: string;
}

/**
 * The file before Claude changed it and the file now, read-only. Loaded lazily:
 * the renderer is large and most visits to the panel never open a diff.
 */
export default function ChangedFileDiff({ filePath, before, after }: Props) {
  const { isDark } = useThemeContext();
  const fileDiff = useMemo(() => {
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    const oldFile: FileContents = { name, contents: before };
    const newFile: FileContents = { name, contents: after };
    return parseDiffFromFile(oldFile, newFile);
  }, [filePath, before, after]);
  const options = useMemo(
    () => ({ diffStyle: 'unified' as const, themeType: (isDark ? 'dark' : 'light') as 'dark' | 'light' }),
    [isDark],
  );
  return <FileDiff fileDiff={fileDiff} options={options} />;
}
