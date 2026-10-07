import { useEffect, useState } from 'react';
import { EyeIcon, EyeSlashIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { isSecretEnvName } from './envVars';

interface Props {
  name: string;
  value: string;
  onSave: (name: string, value: string) => void;
  onRemove: (name: string) => void;
}

const INPUT =
  'min-w-0 bg-surface-overlay border border-border-default rounded-lg px-2.5 py-1 text-sm text-text-primary placeholder-text-tertiary font-mono';

/** One variable: its name, its value (saved when focus leaves), and a way to remove it. */
export function EnvVarLine({ name, value, onSave, onRemove }: Props) {
  const { t } = useTranslation('settings');
  const secret = isSecretEnvName(name);
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-56 shrink-0 truncate font-mono text-sm text-text-primary" title={name}>
        {name}
      </span>
      <input
        type={secret && !shown ? 'password' : 'text'}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-label={t('general.envVars.valueOf', { name })}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(name, draft);
        }}
        className={`flex-1 ${INPUT}`}
      />
      {secret && (
        <button
          type="button"
          onClick={() => setShown((on) => !on)}
          title={shown ? t('general.envVars.hide') : t('general.envVars.show')}
          aria-label={shown ? t('general.envVars.hide') : t('general.envVars.show')}
          className="shrink-0 rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          {shown ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(name)}
        title={t('general.envVars.remove', { name })}
        aria-label={t('general.envVars.remove', { name })}
        className="shrink-0 rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-state-error-fg"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
