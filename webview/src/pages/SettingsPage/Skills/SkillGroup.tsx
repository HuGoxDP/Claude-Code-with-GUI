import { useTranslation } from '@/i18n';
import { SettingSection } from '../common';
import { SkillRow } from './SkillRow';
import type { SkillItem, SkillState } from './useSkills';

/** One place skills live: the project's `.claude/skills/` or the user's. */
export function SkillGroup({ title, location, skills, onChange }: {
  title: string;
  location: string;
  skills: SkillItem[];
  onChange: (skill: SkillItem, state: SkillState) => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <SettingSection title={title} description={<p className="-mt-2 mb-3 text-[0.8461rem] text-text-secondary"><span dir="ltr" className="font-mono">{location}</span></p>}>
      {skills.length === 0 ? (
        <p className="py-3 text-[0.8461rem] text-text-tertiary">{t('skills.empty', { location })}</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {skills.map((skill) => (
            <SkillRow key={`${skill.scope}:${skill.name}`} skill={skill} onChange={(state) => onChange(skill, state)} />
          ))}
        </div>
      )}
    </SettingSection>
  );
}

