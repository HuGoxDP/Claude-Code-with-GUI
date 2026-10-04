import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { SkillItem } from '../useSkills';

const hook = {
  skills: [] as SkillItem[],
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
  setState: vi.fn(),
};
vi.mock('../useSkills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useSkills')>();
  return { ...actual, useSkills: () => hook };
});

const openFile = vi.fn().mockResolvedValue(undefined);
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openFile }) }));

import { SkillsSettings } from '../index';

const skill = (over: Partial<SkillItem>): SkillItem => ({
  name: 'deploy',
  directory: 'deploy',
  scope: 'project',
  path: '/p/.claude/skills/deploy/SKILL.md',
  description: 'Ships the app.',
  frontmatter: 'name: deploy',
  state: 'on',
  stateSource: null,
  ...over,
});

describe('SkillsSettings', () => {
  beforeEach(() => {
    hook.skills = [];
    hook.error = null;
    hook.setState.mockReset().mockResolvedValue(undefined);
    openFile.mockClear();
  });

  it('groups skills by where they live and shows each state', () => {
    hook.skills = [
      skill({}),
      skill({ name: 'notes', scope: 'user', path: '/c/skills/notes/SKILL.md', state: 'off', stateSource: 'user', description: null }),
    ];
    render(<SkillsSettings />);

    const project = screen.getByTestId('skill-row-project-deploy');
    expect(within(project).getByText('/deploy')).toBeTruthy();
    expect(within(project).getByText('Ships the app.')).toBeTruthy();

    const personal = screen.getByTestId('skill-row-user-notes');
    expect(within(personal).getByText('No description')).toBeTruthy();
    expect(within(personal).getByText('Set in ~/.claude/settings.json')).toBeTruthy();
    expect(within(personal).getByRole('button', { name: 'Visibility of /notes' }).textContent).toContain('Off');
  });

  it('changes a state through the hook', async () => {
    hook.skills = [skill({})];
    render(<SkillsSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Visibility of /deploy' }));
    fireEvent.click(screen.getByRole('option', { name: 'Slash command only' }));
    await waitFor(() => expect(hook.setState).toHaveBeenCalledWith(hook.skills[0], 'user-invocable-only'));
  });

  it('opens SKILL.md in the editor', () => {
    hook.skills = [skill({})];
    render(<SkillsSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Open SKILL.md' }));
    expect(openFile).toHaveBeenCalledWith('/p/.claude/skills/deploy/SKILL.md');
  });

  it('says where to put skills when there are none', () => {
    render(<SkillsSettings />);
    expect(screen.getByText('No skills in .claude/skills/.')).toBeTruthy();
    expect(screen.getByText('No skills in ~/.claude/skills/.')).toBeTruthy();
  });

  it('offers a filter only for a long list, and it narrows by name or description', () => {
    hook.skills = Array.from({ length: 7 }, (_, i) => skill({ name: `s${i}`, description: i === 3 ? 'release notes' : 'other' }));
    render(<SkillsSettings />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter skills' }), { target: { value: 'release' } });
    expect(screen.getByTestId('skill-row-project-s3')).toBeTruthy();
    expect(screen.queryByTestId('skill-row-project-s0')).toBeNull();
  });
});
