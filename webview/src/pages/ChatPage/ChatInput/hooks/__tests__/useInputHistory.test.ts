import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sendMock = vi.fn();

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { useInputHistory } from '../useInputHistory';
import { MessageType } from '@/shared';

/** A raw JSONL entry as the backend passes it through, untouched. */
function entry(uuid: string, text: string) {
  return {
    type: 'user',
    uuid,
    permissionMode: 'default',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

function page(entries: ReturnType<typeof entry>[], hasMore = false, oldestUuid?: string) {
  return { status: 'ok', entries, hasMore, oldestUuid: oldestUuid ?? entries[0]?.uuid };
}

function render(sessionId: string | null = 's1', workingDirectory: string | null = '/w') {
  return renderHook(() => useInputHistory({ workingDirectory, sessionId }));
}

describe('useInputHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue(page([]));
  });

  it('asks the backend for the session prompts on mount', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'first'), entry('u2', 'second')]));
    const { result } = render();

    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, {
      workingDir: '/w',
      sessionId: 's1',
      beforeUuid: undefined,
    });
  });

  it('walks the fetched prompts newest first', async () => {
    // The backend sends transcript order (oldest first); Up must start at the newest.
    sendMock.mockResolvedValue(page([entry('u1', 'oldest'), entry('u2', 'newest')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { expect(result.current.navigateUp('draft')).toBe('newest') });
    act(() => { expect(result.current.navigateUp('draft')).toBe('oldest') });
    // Nothing older: the key falls through instead of sticking on the last entry.
    act(() => { expect(result.current.navigateUp('draft')).toBeNull() });
  });

  it('restores the draft when walking back down past the newest', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'sent before')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { result.current.navigateUp('half-typed') });
    expect(result.current.isNavigating).toBe(true);

    act(() => { expect(result.current.navigateDown()).toBe('half-typed') });
    expect(result.current.isNavigating).toBe(false);
  });

  it('finds a just-sent prompt without another round trip', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'from the transcript')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();

    act(() => { result.current.pushToHistory('just typed') });

    // The CLI has not written it to the transcript yet, so the backend cannot
    // know about it — it has to come from here.
    act(() => { expect(result.current.navigateUp('')).toBe('just typed') });
    act(() => { expect(result.current.navigateUp('')).toBe('from the transcript') });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('resets the walk position without forgetting the prompts', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'a'), entry('u2', 'b')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { result.current.navigateUp('draft') });
    act(() => { result.current.resetHistory() });

    expect(result.current.isNavigating).toBe(false);
    // The next Up starts from the newest again rather than resuming mid-walk.
    act(() => { expect(result.current.navigateUp('')).toBe('b') });
  });

  it('fetches the next page as the walk nears the end of what is loaded', async () => {
    sendMock.mockResolvedValueOnce(page([entry('u1', 'p1'), entry('u2', 'p2')], true, 'u1'));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();
    sendMock.mockResolvedValue(page([entry('u0', 'p0')], false, 'u0'));

    act(() => { result.current.navigateUp('') });

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, {
      workingDir: '/w',
      sessionId: 's1',
      beforeUuid: 'u1',
    }));
    // The older page appends behind what was already there.
    await waitFor(() => {
      act(() => { result.current.navigateUp('') });
      act(() => { expect(result.current.navigateUp('')).toBe('p0') });
    });
  });

  it('does not page past the end when the backend says there is no more', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'only')], false, 'u1'));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();

    act(() => { result.current.navigateUp('') });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('drops the previous session prompts when the session changes', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'from session one')]));
    const { result, rerender } = renderHook(
      ({ sessionId }) => useInputHistory({ workingDirectory: '/w', sessionId }),
      { initialProps: { sessionId: 's1' as string | null } },
    );
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    sendMock.mockResolvedValue(page([]));
    rerender({ sessionId: 's2' });

    await waitFor(() => expect(result.current.isEmpty).toBe(true));
    act(() => { expect(result.current.navigateUp('')).toBeNull() });
  });

  it('keeps the first prompt of a session that was created by sending it', async () => {
    // Sending from an uninitialized session creates the session, so sessionId
    // goes null -> id. Treating that as a switch would discard the very prompt
    // that caused it, and Up would find nothing at all.
    const { result, rerender } = renderHook(
      ({ sessionId }) => useInputHistory({ workingDirectory: '/w', sessionId }),
      { initialProps: { sessionId: null as string | null } },
    );

    act(() => { result.current.pushToHistory('the first thing typed') });
    rerender({ sessionId: 's-new' });

    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    act(() => { expect(result.current.navigateUp('')).toBe('the first thing typed') });
    // Nothing to ask the backend for either: the transcript has no prompt this
    // hook does not already hold, and asking would risk showing it twice.
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, expect.anything());
  });

  it('asks a new chat for the project history, not for a conversation of its own', async () => {
    render(null);
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROJECT_PROMPT_HISTORY, {
      workingDir: '/w',
      excludeSessionId: undefined,
      cursor: undefined,
    }));
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, expect.anything());
  });

  it('leaves the history empty when the backend reports an error', async () => {
    sendMock.mockResolvedValue({ status: 'error', error: 'nope' });
    const { result } = render();

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(result.current.isEmpty).toBe(true);
    act(() => { expect(result.current.navigateUp('')).toBeNull() });
  });

  it('survives a rejected request', async () => {
    sendMock.mockRejectedValue(new Error('socket closed'));
    const { result } = render();

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(result.current.isEmpty).toBe(true);
  });
});

describe('useInputHistory across the project', () => {
  type Handler = (payload: Record<string, unknown>) => unknown;
  function route(handlers: { session?: Handler; project?: Handler }) {
    sendMock.mockImplementation(async (type: string, payload: Record<string, unknown>) => {
      if (type === MessageType.LOAD_PROMPT_HISTORY) return handlers.session?.(payload) ?? page([]);
      if (type === MessageType.LOAD_PROJECT_PROMPT_HISTORY) return handlers.project?.(payload) ?? { status: 'ok', entries: [], hasMore: false };
      throw new Error(`unexpected ${type}`);
    });
  }
  function projectPage(texts: string[], hasMore = false, next?: Record<string, unknown>) {
    // Oldest first, as the backend sends it.
    return { status: 'ok', entries: texts.map((t, i) => entry(`p-${t}-${i}`, t)).reverse(), hasMore, next };
  }

  beforeEach(() => vi.clearAllMocks());

  it('goes on into the other conversations once this one runs out, leaving this one out', async () => {
    route({
      session: () => page([entry('u1', 'here old'), entry('u2', 'here new')]),
      project: () => projectPage(['other new', 'other old']),
    });
    const { result } = render('s1');
    await waitFor(() => expect(result.current.entries).toEqual(['here new', 'here old', 'other new', 'other old']));

    expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROJECT_PROMPT_HISTORY, {
      workingDir: '/w',
      excludeSessionId: 's1',
      cursor: undefined,
    });
    const walked: (string | null)[] = [];
    for (let i = 0; i < 5; i++) act(() => { walked.push(result.current.navigateUp('draft')); });
    expect(walked).toEqual(['here new', 'here old', 'other new', 'other old', null]);
  });

  it('does not repeat a prompt that is already in the list', async () => {
    route({
      session: () => page([entry('u1', 'continue'), entry('u2', 'fix the test')]),
      project: () => projectPage(['continue', 'add a flag', 'continue', 'fix the test']),
    });
    const { result } = render('s1');
    await waitFor(() => expect(result.current.entries).toContain('add a flag'));

    expect(result.current.entries).toEqual(['fix the test', 'continue', 'add a flag']);
  });

  it('asks the other conversations only after this one has no more pages', async () => {
    route({
      session: (p) => (p.beforeUuid ? page([entry('u0', 'p0')], false) : page([entry('u1', 'p1'), entry('u2', 'p2')], true, 'u1')),
      project: () => projectPage(['elsewhere']),
    });
    const { result } = render('s1');
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.LOAD_PROJECT_PROMPT_HISTORY, expect.anything());

    act(() => { result.current.navigateUp(''); });
    await waitFor(() => expect(result.current.entries).toEqual(['p2', 'p1', 'p0', 'elsewhere']));
  });

  it('pages on through the other conversations with the cursor it was given', async () => {
    const next = { sessionId: 'b', sortedAt: 2, beforeUuid: 'x' };
    route({
      project: (p) => (p.cursor ? projectPage(['older']) : projectPage(['newer', 'new'], true, next)),
    });
    const { result } = render(null);
    await waitFor(() => expect(result.current.entries).toEqual(['newer', 'new']));

    act(() => { result.current.navigateUp(''); });
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROJECT_PROMPT_HISTORY, {
      workingDir: '/w',
      excludeSessionId: undefined,
      cursor: next,
    }));
    await waitFor(() => expect(result.current.entries).toEqual(['newer', 'new', 'older']));
  });

  it('preloads pages up to the number asked for, and stops there', async () => {
    let calls = 0;
    route({
      project: (p) => {
        calls++;
        const n = p.cursor ? (p.cursor as { n: number }).n : 0;
        return projectPage([`a${n}`, `b${n}`], true, { sessionId: 's', sortedAt: 1, n: n + 1 });
      },
    });
    const { result } = renderHook(() => useInputHistory({ workingDirectory: '/w', sessionId: null, preload: 5 }));

    await waitFor(() => expect(result.current.entries.length).toBe(6));
    await new Promise(r => setTimeout(r, 20));
    expect(calls).toBe(3);
  });

  it('drops a page of the other conversations that lands after a switch', async () => {
    let release: (v: unknown) => void = () => {};
    route({
      session: () => page([]),
      project: (p) => (p.excludeSessionId === 's1'
        ? new Promise(r => { release = r; })
        : projectPage([])),
    });
    const { result, rerender } = renderHook(
      ({ sessionId }) => useInputHistory({ workingDirectory: '/w', sessionId }),
      { initialProps: { sessionId: 's1' as string | null } },
    );
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROJECT_PROMPT_HISTORY, expect.objectContaining({ excludeSessionId: 's1' })));

    rerender({ sessionId: 's2' });
    await act(async () => { release(projectPage(['from before the switch'])); });

    expect(result.current.entries).toEqual([]);
  });
});
