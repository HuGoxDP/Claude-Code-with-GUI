import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { Select } from '@/components/Select';
import { useTranslation } from '@/i18n';
import { SKILL_STATES, type SkillItem, type SkillState } from './useSkills';

/** The settings file named in a row, as the user would find it on disk. */
function sourceFile(source: SkillItem['stateSource']): string | null {
  switch (source) {
    case 'local':
      return '.claude/settings.local.json';
    case 'project':
      return '.claude/settings.json';
    case 'user':
      return '~/.claude/settings.json';
    default:
      return null;
  }
}

export function SkillRow({ skill, onChange }: { skill: SkillItem; onChange: (state: SkillState) => void }) {
  const { t } = useTranslation('settings');
  const file = sourceFile(skill.stateSource);
  const options = SKILL_STATES.map((state) => ({ value: state, label: t(`skills.state.${state}`) }));

  return (
    <div className="flex items-start justify-between gap-4 py-3" data-testid={`skill-row-${skill.scope}-${skill.name}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span dir="ltr" className={`font-mono text-[0.9230rem] ${skill.state === 'off' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
            /{skill.name}
          </span>
          <button
            type="button"
            onClick={() => getAdapter().openFile(skill.path).catch(() => toast.error(t('skills.openFailed')))}
            className="text-[0.7692rem] text-text-link hover:underline"
          >
            {t('skills.open')}
          </button>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[0.8461rem] text-text-secondary">
          {skill.description ?? <span className="italic text-text-tertiary">{t('skills.noDescription')}</span>}
        </p>
        {file && (
          <p className="mt-1 text-[0.7692rem] text-text-tertiary">
            {t('skills.setIn', { file })}
          </p>
        )}
      </div>
      <div className="w-52 shrink-0">
        <Select
          value={skill.state}
          options={options}
          onChange={(value) => onChange(value as SkillState)}
          ariaLabel={t('skills.stateLabel', { name: skill.name })}
          className="w-full"
        />
      </div>
    </div>
  );
}

