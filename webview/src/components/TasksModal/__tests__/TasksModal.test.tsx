/** The task list panel: either source, statuses, progress, live refresh. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { MessageType } from '@/shared';
import type { LoadedMessageDto } from '@/types';

const send = vi.fn();
let stream: { isStreaming: boolean; messages: LoadedMessageDto[] } = { isStreaming: false, messages: [] };
vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => ({ send }) }));
vi.mock('@/contexts/ChatStreamContext', () => ({ useChatStreamContext: () => stream }));
vi.mock('@/hooks/useSessionAssets', () => ({
  useSessionScope: () => ({ workingDir: '/work/app', sessionId: 's1' }),
}));
vi.mock('@/pages/ChatPage/SessionHeader/dock/useDockLayout', () => ({
  useDockLayout: () => ({ layout: { order: [], visible: [] }, save: vi.fn() }),
}));

import { TasksModal } from '../index';
import { countTaskToolResults, toSessionTasks } from '@/hooks/useSessionTasks';

let reply: Record<string, unknown>;

function renderModal() {
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <TasksModal onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    rerenderModal: () =>
      view.rerender(
        <QueryClientProvider client={client}>
          <TasksModal onClose={vi.fn()} />
        </QueryClientProvider>,
      ),
  };
}

const taskFiles = [
  { id: '1', subject: 'Read the parser', description: 'Find where tokens are split', activeForm: 'Reading the parser', status: 'completed', blocks: ['2'], blockedBy: [] },
  { id: '2', subject: 'Fix the tokenizer', description: 'Handle escaped quotes', activeForm: 'Fixing the tokenizer', status: 'in_progress', blocks: ['3'], blockedBy: ['1'] },
  { id: '3', subject: 'Run the tests', status: 'pending', blocks: [], blockedBy: ['2'] },
];

beforeEach(() => {
  cleanup();
  stream = { isStreaming: false, messages: [] };
  reply = { status: 'ok', source: 'taskList', listId: 's1', tasks: taskFiles };
  send.mockReset().mockImplementation(async (type: string) => (type === MessageType.GET_SESSION_TASKS ? reply : { status: 'ok' }));
});

describe('toSessionTasks', () => {
  it('reads task files and TodoWrite items alike, and drops what is not a task', () => {
    const tasks = toSessionTasks([
      ...taskFiles,
      { content: 'A to-do', status: 'in_progress', activeForm: 'Doing it' },
      { id: '9', subject: 'Gone', status: 'deleted' },
      { status: 'pending' },
    ]);
    expect(tasks.map((t) => [t.id, t.title, t.status])).toEqual([
      ['1', 'Read the parser', 'completed'],
      ['2', 'Fix the tokenizer', 'in_progress'],
      ['3', 'Run the tests', 'pending'],
      [null, 'A to-do', 'in_progress'],
    ]);
  });

  it('keeps only the blockers that are not done yet', () => {
    const [, two, three] = toSessionTasks(taskFiles);
    expect(two.waitingOn).toEqual([]);
    expect(three.waitingOn).toEqual(['2']);
  });
});

describe('countTaskToolResults', () => {
  it('counts the results of task tools only', () => {
    const messages = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'TaskUpdate', input: {} }, { type: 'tool_use', id: 'b', name: 'Bash', input: {} }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a' }, { type: 'tool_result', tool_use_id: 'b' }] } },
    ] as unknown as LoadedMessageDto[];
    expect(countTaskToolResults(messages)).toBe(1);
    expect(countTaskToolResults([])).toBe(0);
  });
});

describe('TasksModal', () => {
  it('shows the task list with ids, progress, what is running, and what waits', async () => {
    renderModal();
    expect(await screen.findByText('Fix the tokenizer')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(MessageType.GET_SESSION_TASKS, { workingDir: '/work/app', sessionId: 's1' });
    expect(screen.getAllByText('1/3 done').length).toBeGreaterThan(0);
    expect(screen.getByText('#2')).toBeTruthy();
    // A running task reads as what it is doing; a pending one as what it is about.
    expect(screen.getByText('Fixing the tokenizer')).toBeTruthy();
    expect(screen.getByText('Waiting on #2')).toBeTruthy();
    // A finished task does not repeat its description.
    expect(screen.queryByText('Find where tokens are split')).toBeNull();
    expect(screen.getByText("Claude Code's task list for this session, as Claude last updated it.")).toBeTruthy();
  });

  it('shows a TodoWrite list without ids', async () => {
    reply = { status: 'ok', source: 'todoWrite', tasks: [{ content: 'Write the docs', status: 'pending', activeForm: 'Writing the docs' }] };
    renderModal();
    expect(await screen.findByText('Write the docs')).toBeTruthy();
    expect(screen.queryByText(/^#/)).toBeNull();
    expect(screen.getByText("Claude's last to-do list in this conversation (TodoWrite).")).toBeTruthy();
  });

  it('says so when the session has no list', async () => {
    reply = { status: 'ok', source: null, tasks: [] };
    renderModal();
    expect(await screen.findByText('Claude has no task list in this session.')).toBeTruthy();
  });

  it('reads the list again when a task tool returns', async () => {
    const { rerenderModal } = renderModal();
    await screen.findByText('Fix the tokenizer');
    const calls = send.mock.calls.length;

    reply = { ...reply, tasks: taskFiles.map((t) => (t.id === '2' ? { ...t, status: 'completed' } : t)) };
    stream = {
      isStreaming: true,
      messages: [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'u1', name: 'TaskUpdate', input: { taskId: '2', status: 'completed' } }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'Updated task #2 status' }] } },
      ] as unknown as LoadedMessageDto[],
    };
    rerenderModal();

    await waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(calls));
    expect(await screen.findAllByText('2/3 done')).toBeTruthy();
  });

  it('closes on Escape without the key reaching the composer, so a running turn is not stopped', async () => {
    const composer = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) composer();
    };
    window.addEventListener('keydown', listener);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <TasksModal onClose={onClose} />
      </QueryClientProvider>,
    );
    await screen.findByText('Fix the tokenizer');
    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', listener);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(composer).not.toHaveBeenCalled();
  });
});
