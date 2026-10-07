import { useState } from 'react';
import toast from 'react-hot-toast';
import { SettingRow } from '../../../common';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useBridge } from '@/hooks/useBridge';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { EnvVarLine } from './EnvVarLine';
import { ENV_NAME, envEntries } from './envVars';

const INPUT =
  'min-w-0 bg-surface-overlay border border-border-default rounded-lg px-2.5 py-1 text-sm text-text-primary placeholder-text-tertiary font-mono';

/**
 * Claude Code's `env` block: the variables it sets for every session (ported
 * from CC GUI's environment variable editor). The user tab edits
 * ~/.claude/settings.json, the project tab the project's .claude/settings.json;
 * each variable is written to the file that already holds it (SAVE_CLAUDE_ENV_VAR).
 */
export function EnvVarsRow() {
  const { t } = useTranslation('settings');
  const { send } = useBridge();
  const { workingDirectory } = useWorkingDir();
  const { scope, scopeSettings, refreshSettings } = useClaudeSettings();
  const entries = envEntries(scopeSettings.env);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const projectWithoutFolder = scope === 'project' && !workingDirectory;

  const save = async (name: string, value: string | null) => {
    try {
      const res = await send<{ status: string; error?: string }>(MessageType.SAVE_CLAUDE_ENV_VAR, {
        name,
        value,
        scope,
        workingDir: workingDirectory ?? undefined,
      });
      if (res?.status === 'error') throw new Error(res.error);
      await refreshSettings();
      return true;
    } catch (error) {
      toast.error(`${t('general.envVars.saveFailed')}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!ENV_NAME.test(name)) return setNameError(t('general.envVars.invalidName'));
    setNameError(null);
    if (await save(name, newValue)) {
      setNewName('');
      setNewValue('');
    }
  };

  return (
    <SettingRow
      label={t('general.envVars.label')}
      description={t('general.envVars.description')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#environment-variables"
        />
      }
      below={
        <div className="mt-3 flex flex-col gap-2">
          {entries.length === 0 && <p className="text-xs text-text-tertiary">{t('general.envVars.empty')}</p>}
          {entries.map(([name, value]) => (
            <EnvVarLine key={name} name={name} value={value} onSave={(n, v) => void save(n, v)} onRemove={(n) => void save(n, null)} />
          ))}
          <div className="flex items-center gap-2">
            <input
              value={newName}
              spellCheck={false}
              placeholder={t('general.envVars.namePlaceholder')}
              aria-label={t('general.envVars.namePlaceholder')}
              onChange={(e) => setNewName(e.target.value)}
              disabled={projectWithoutFolder}
              className={`w-56 shrink-0 ${INPUT}`}
            />
            <input
              value={newValue}
              spellCheck={false}
              autoComplete="off"
              placeholder={t('general.envVars.valuePlaceholder')}
              aria-label={t('general.envVars.valuePlaceholder')}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
              }}
              disabled={projectWithoutFolder}
              className={`flex-1 ${INPUT}`}
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={projectWithoutFolder || newName.trim() === ''}
              className="shrink-0 rounded-lg border border-border-default bg-surface-overlay px-3 py-1 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
            >
              {t('general.envVars.add')}
            </button>
          </div>
          {nameError && <p className="text-xs text-state-warning-fg">{nameError}</p>}
          {scope === 'project' && <p className="text-xs text-text-tertiary">{t('general.envVars.projectNote')}</p>}
        </div>
      }
    >
      <span className="text-xs text-text-tertiary">{t('general.envVars.count', { count: entries.length })}</span>
    </SettingRow>
  );
}
