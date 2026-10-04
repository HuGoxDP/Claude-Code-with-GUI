import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useTranslation } from '@/i18n';
import { SkillGroup } from './SkillGroup';
import { SKILL_STATES, useSkills, type SkillItem, type SkillState } from './useSkills';

const SKILLS_DOC_URL = 'https://code.claude.com/docs/en/skills';
/** Past this many skills the list gets a filter box. */
const FILTER_THRESHOLD = 6;

/**
 * Settings → Skills: the CLI's `/skills`. Lists the project's and the user's
 * skills and sets how much of each the model and the slash menu see, through the
 * CLI's own `skillOverrides` setting.
 */
export function SkillsSettings() {
  const { t } = useTranslation('settings');
  const { skills, isLoading, error, refresh, setState } = useSkills();
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [skills, filter]);

  const change = (skill: SkillItem, state: SkillState) => {
    if (state === skill.state) return;
    setState(skill, state).catch((err: Error) => toast.error(t('skills.saveFailed', { error: err.message })));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          {t('skills.title')}
          <SettingBadge variant={SettingBadgeVariant.ClaudeNative} docHref={SKILLS_DOC_URL} />
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          title={t('skills.refresh')}
          aria-label={t('skills.refresh')}
          className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-4 text-[0.8461rem] text-text-secondary">{t('skills.description')}</p>

      <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border-default bg-surface-raised p-3 text-[0.8461rem]">
        {SKILL_STATES.map((state) => (
          <div key={state} className="contents">
            <dt className="font-medium text-text-primary">{t(`skills.state.${state}`)}</dt>
            <dd className="text-text-secondary">{t(`skills.stateHint.${state}`)}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mb-6 rounded-lg border border-state-error-border bg-state-error-bg p-3 text-sm text-state-error-fg">{error}</div>
      )}

      {skills.length > FILTER_THRESHOLD && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('skills.filter')}
          aria-label={t('skills.filter')}
          className="mb-6 w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
        />
      )}

      {!isLoading && (
        <>
          <SkillGroup
            title={t('skills.project')}
            location=".claude/skills/"
            skills={visible.filter((s) => s.scope === 'project')}
            onChange={change}
          />
          <SkillGroup
            title={t('skills.user')}
            location="~/.claude/skills/"
            skills={visible.filter((s) => s.scope === 'user')}
            onChange={change}
          />
        </>
      )}
    </div>
  );
}
