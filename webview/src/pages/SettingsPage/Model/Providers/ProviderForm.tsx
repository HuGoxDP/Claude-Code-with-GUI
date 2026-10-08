import { useState } from 'react';
import { Select } from '@/components/Select';
import { useTranslation } from '@/i18n';
import type { ApiProviderInput, ApiProviderView } from './useApiProviders';

interface Props {
  /** The provider being changed, or none for a new one. */
  provider?: ApiProviderView;
  onSave: (input: ApiProviderInput) => Promise<string | null>;
  onCancel: () => void;
}

const INPUT =
  'w-full min-w-0 bg-surface-overlay border border-border-default rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder-text-tertiary';

/** The model slots, each with the variable it sets. */
const MODEL_FIELDS = [
  ['model', 'ANTHROPIC_MODEL'],
  ['opusModel', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
  ['sonnetModel', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
  ['haikuModel', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
  ['fableModel', 'ANTHROPIC_DEFAULT_FABLE_MODEL'],
] as const;

/**
 * Add or change a provider. Several fields make one provider, so it is saved
 * as a whole with Save rather than field by field. The key is never shown
 * back: left empty it stays as saved.
 */
export function ProviderForm({ provider, onSave, onCancel }: Props) {
  const { t } = useTranslation('settings');
  const [fields, setFields] = useState({
    name: provider?.name ?? '',
    baseUrl: provider?.baseUrl ?? '',
    authVar: provider?.authVar ?? 'ANTHROPIC_AUTH_TOKEN',
    model: provider?.model ?? '',
    opusModel: provider?.opusModel ?? '',
    sonnetModel: provider?.sonnetModel ?? '',
    haikuModel: provider?.haikuModel ?? '',
    fableModel: provider?.fableModel ?? '',
  });
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (name: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [name]: e.target.value }));

  const save = async () => {
    setSaving(true);
    // An untouched key field keeps the saved key; a new provider has none to keep.
    const keyChange = removeKey ? '' : key.trim() !== '' ? key.trim() : provider ? undefined : '';
    const refused = await onSave({ ...(provider ? { id: provider.id } : {}), ...fields, ...(keyChange !== undefined ? { key: keyChange } : {}) });
    setSaving(false);
    if (refused) setError(refused);
  };

  const label = (text: string, hint?: string) => (
    <span className="mb-1 block text-xs text-text-secondary">
      {text}
      {hint && <span className="ms-1.5 font-mono text-text-tertiary">{hint}</span>}
    </span>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-base p-4">
      <label className="block">
        {label(t('cli.providers.form.name'))}
        <input value={fields.name} onChange={set('name')} className={INPUT} aria-label={t('cli.providers.form.name')} />
      </label>
      <label className="block">
        {label(t('cli.providers.form.baseUrl'), 'ANTHROPIC_BASE_URL')}
        <input value={fields.baseUrl} onChange={set('baseUrl')} placeholder="https://" spellCheck={false} className={`${INPUT} font-mono`} aria-label={t('cli.providers.form.baseUrl')} />
      </label>
      <div className="flex flex-col gap-1">
        {label(t('cli.providers.form.key'))}
        <div className="flex items-center gap-2">
          <Select
            value={fields.authVar}
            options={[
              { value: 'ANTHROPIC_AUTH_TOKEN', label: 'ANTHROPIC_AUTH_TOKEN' },
              { value: 'ANTHROPIC_API_KEY', label: 'ANTHROPIC_API_KEY' },
            ]}
            onChange={(value) => setFields((f) => ({ ...f, authVar: value }))}
            ariaLabel={t('cli.providers.form.keyVar')}
            className="shrink-0 bg-surface-overlay border border-border-default rounded-lg px-2.5 py-1.5 font-mono text-xs text-text-primary"
          />
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={removeKey}
            autoComplete="off"
            placeholder={provider?.hasKey ? t('cli.providers.form.keyKept') : t('cli.providers.form.keyNew')}
            aria-label={t('cli.providers.form.key')}
            className={`${INPUT} font-mono disabled:opacity-50`}
          />
        </div>
        {provider?.hasKey && (
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} />
            {t('cli.providers.form.removeKey')}
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {MODEL_FIELDS.map(([name, variable]) => (
          <label key={name} className="block">
            {label(t(`cli.providers.form.${name}`), variable)}
            <input value={fields[name]} onChange={set(name)} spellCheck={false} className={`${INPUT} font-mono`} aria-label={t(`cli.providers.form.${name}`)} />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-state-warning-fg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover">
          {t('cli.providers.form.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || fields.name.trim() === ''}
          className="rounded-lg bg-accent-primary px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {t('cli.providers.form.save')}
        </button>
      </div>
    </div>
  );
}
