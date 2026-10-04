import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/features/commit-message', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/features/commit-message')>();
  return { ...actual, generateCommitMessage: vi.fn() };
});

import { generateCommitMessage, CommitMessageError } from '../../core/features/commit-message';
import { handleCommitMessageRequest } from '../commit-message-route';

describe('handleCommitMessageRequest', () => {
  beforeEach(() => {
    vi.mocked(generateCommitMessage).mockReset();
  });

  it('rejects a body that is not JSON or has no workingDir', async () => {
    expect((await handleCommitMessageRequest('{')).status).toBe(400);
    expect((await handleCommitMessageRequest('{"paths":[]}')).status).toBe(400);
    expect(generateCommitMessage).not.toHaveBeenCalled();
  });

  it('answers with the message and passes only string paths on', async () => {
    vi.mocked(generateCommitMessage).mockResolvedValue({ message: 'fix: x', scope: 'selected' });
    const result = await handleCommitMessageRequest(JSON.stringify({
      workingDir: '/r',
      paths: ['/r/a.ts', 3, '', '/r/b.ts'],
      draft: 'wip',
    }));
    expect(result).toEqual({ status: 200, body: { message: 'fix: x', scope: 'selected' } });
    expect(generateCommitMessage).toHaveBeenCalledWith({ workingDir: '/r', paths: ['/r/a.ts', '/r/b.ts'], draft: 'wip', model: null });
  });

  it('turns "nothing to describe" into 422 with its code', async () => {
    vi.mocked(generateCommitMessage).mockRejectedValue(new Error(CommitMessageError.NoChanges));
    expect(await handleCommitMessageRequest('{"workingDir":"/r"}')).toEqual({ status: 422, body: { error: 'no-changes' } });
  });

  it('passes a CLI failure through as 500 with its text', async () => {
    vi.mocked(generateCommitMessage).mockRejectedValue(new Error('Not logged in · Please run /login'));
    expect(await handleCommitMessageRequest('{"workingDir":"/r"}')).toEqual({
      status: 500,
      body: { error: 'Not logged in · Please run /login' },
    });
  });
});
