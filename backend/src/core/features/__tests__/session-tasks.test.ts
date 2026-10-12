import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let chain: Record<string, unknown>[] = [];
vi.mock('../loadSessionMessages', () => ({
  loadActiveChain: vi.fn(async () => chain),
}));

let settingsEnv: Record<string, string> = {};
vi.mock('../settings-env', () => ({
  resolveEnv: vi.fn(async () => ({ ...settingsEnv })),
}));

import { fileSafeId, getSessionTasks, lastTodoWrite } from '../session-tasks';

const SESSION = 'c9283069-ff27-5348-97c3-8e8ea5ca6d62';

function todoWrite(todos: unknown) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'TodoWrite', input: { todos } }] } };
}

describe('session tasks', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'session-tasks-'));
    previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = root;
    chain = [];
    settingsEnv = {};
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  async function writeTask(listId: string, task: Record<string, unknown>) {
    const dir = join(root, 'tasks', listId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${String(task.id)}.json`), JSON.stringify(task));
  }

  it('reads the task list folder named after the session, in id order and unedited', async () => {
    const ten = { id: '10', subject: 'Ten', status: 'pending', blocks: [], blockedBy: ['2'], extra: { kept: true } };
    await writeTask(SESSION, ten);
    await writeTask(SESSION, { id: '2', subject: 'Two', status: 'in_progress', activeForm: 'Doing two' });
    await writeFile(join(root, 'tasks', SESSION, '.lock'), '');

    const result = await getSessionTasks('/work', SESSION);
    expect(result.source).toBe('taskList');
    expect(result.listId).toBe(SESSION);
    expect(result.tasks.map((t) => t.id)).toEqual(['2', '10']);
    expect(result.tasks[1]).toEqual(ten);
  });

  it('follows CLAUDE_CODE_TASK_LIST_ID, made file-safe the way the CLI does', async () => {
    settingsEnv = { CLAUDE_CODE_TASK_LIST_ID: 'my list/1' };
    await writeTask('my-list-1', { id: '1', subject: 'Shared', status: 'pending' });
    await writeTask(SESSION, { id: '1', subject: 'Own', status: 'pending' });

    const result = await getSessionTasks('/work', SESSION);
    expect(result.listId).toBe('my-list-1');
    expect(result.tasks.map((t) => t.subject)).toEqual(['Shared']);
  });

  it('treats an existing but empty folder as an empty list, not as no list', async () => {
    await mkdir(join(root, 'tasks', SESSION), { recursive: true });
    chain = [todoWrite([{ content: 'Old', status: 'pending' }])];

    expect(await getSessionTasks('/work', SESSION)).toEqual({ source: 'taskList', listId: SESSION, tasks: [] });
  });

  it('skips a task file that is not JSON', async () => {
    await writeTask(SESSION, { id: '1', subject: 'Good', status: 'pending' });
    await writeFile(join(root, 'tasks', SESSION, '2.json'), '{"id": "2", "subj');

    const result = await getSessionTasks('/work', SESSION);
    expect(result.tasks.map((t) => t.id)).toEqual(['1']);
  });

  it('falls back to the last TodoWrite on the chain when there is no folder', async () => {
    chain = [
      todoWrite([{ content: 'First', status: 'pending', activeForm: 'Firsting' }]),
      { type: 'user', message: { content: 'go on' } },
      todoWrite([
        { content: 'First', status: 'completed', activeForm: 'Firsting' },
        { content: 'Second', status: 'in_progress', activeForm: 'Seconding' },
      ]),
    ];

    const result = await getSessionTasks('/work', SESSION);
    expect(result.source).toBe('todoWrite');
    expect(result.tasks).toEqual([
      { content: 'First', status: 'completed', activeForm: 'Firsting' },
      { content: 'Second', status: 'in_progress', activeForm: 'Seconding' },
    ]);
  });

  it('reports no list when the session has neither', async () => {
    chain = [{ type: 'user', message: { content: 'hi' } }];
    expect(await getSessionTasks('/work', SESSION)).toEqual({ source: null, tasks: [] });
  });
});

describe('lastTodoWrite', () => {
  it('keeps an explicit empty list, and ignores malformed calls and items', () => {
    expect(lastTodoWrite([todoWrite([{ content: 'a' }]), todoWrite([])])).toEqual([]);
    expect(lastTodoWrite([todoWrite([{ content: 'a' }]), todoWrite('nope')])).toEqual([{ content: 'a' }]);
    expect(lastTodoWrite([todoWrite([null, 'x', { content: 'b' }])])).toEqual([{ content: 'b' }]);
    expect(lastTodoWrite([])).toBeNull();
  });
});

describe('fileSafeId', () => {
  it('replaces everything but letters, digits, _ and -', () => {
    expect(fileSafeId('a.b/c d_e-f')).toBe('a-b-c-d_e-f');
  });
});
