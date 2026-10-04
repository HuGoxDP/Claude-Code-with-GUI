import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/** The CLI's `skillOverrides` values. Absent means "on". */
export const SKILL_STATES = ['on', 'name-only', 'user-invocable-only', 'off'] as const;
export type SkillState = (typeof SKILL_STATES)[number];

/** One skill as the backend reports it (core/features/skills.ts), unedited. */
export interface SkillItem {
  name: string;
  directory: string;
  scope: 'user' | 'project';
  path: string;
  description: string | null;
  frontmatter: string | null;
  state: SkillState;
  /** Which settings file decides the state; null when none does. */
  stateSource: 'local' | 'project' | 'user' | null;
}

interface ListAck {
  status?: 'ok' | 'error';
  skills?: SkillItem[];
  error?: string;
}

/**
 * The user's and the project's skills, and a way to change how visible each is.
 * A change answers with the whole list as it now stands, which replaces the
 * cached one, so the screen shows what the files say rather than what was asked.
 */
export function useSkills() {
  const { send } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();
  const queryClient = useQueryClient();
  const queryKey = [MessageType.GET_SKILLS, workingDirectory];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const ack = await send<ListAck>(MessageType.GET_SKILLS, { workingDir: workingDirectory ?? undefined });
      if (ack?.status !== 'ok') throw new Error(ack?.error ?? 'Could not read skills');
      return ack.skills ?? [];
    },
  });

  const setState = useCallback(async (skill: SkillItem, state: SkillState) => {
    const ack = await send<ListAck>(MessageType.SET_SKILL_STATE, {
      workingDir: workingDirectory ?? undefined,
      name: skill.name,
      scope: skill.scope,
      state,
    });
    if (ack?.status !== 'ok') throw new Error(ack?.error ?? 'Could not save');
    queryClient.setQueryData([MessageType.GET_SKILLS, workingDirectory], ack.skills ?? []);
  }, [send, queryClient, workingDirectory]);

  return {
    skills: query.data ?? [],
    isLoading: query.isLoading,
    error: query.isError ? (query.error as Error).message : null,
    refresh: () => query.refetch(),
    setState,
  };
}
