import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePromptEnhancer, ENHANCE_TIMEOUT_MS } from '../usePromptEnhancer';
import { MessageType } from '@/shared';
import type { IdeSelectionPayload } from '@/hooks/useIdeSelection';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const selection: IdeSelectionPayload = {
  absolutePath: '/p/src/a.ts',
  relativePath: 'src/a.ts',
  startLine: 4,
  endLine: 8,
  selectedText: 'foo()',
  workingDir: '/p',
  isGitignored: false,
};

describe('usePromptEnhancer', () => {
  it('sends the draft with the model, project and editor context', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', enhancedPrompt: 'Better' });
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: selection }));

    act(() => result.current.start('fix it'));
    expect(result.current.state).toMatchObject({ phase: 'loading', original: 'fix it' });

    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    expect(result.current.state.enhanced).toBe('Better');
    expect(send).toHaveBeenCalledWith(
      MessageType.ENHANCE_PROMPT,
      {
        prompt: 'fix it',
        workingDir: '/p',
        model: 'opus',
        context: { filePath: 'src/a.ts', selectedText: 'foo()', startLine: 4, endLine: 8 },
      },
      { timeout: ENHANCE_TIMEOUT_MS },
    );
  });

  it('sends no context when the editor-context tag is off', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', enhancedPrompt: 'Better' });
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: null, model: 'default', editorContext: null }));
    act(() => result.current.start('fix it'));
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    expect(send.mock.calls[0]![1]).toMatchObject({ context: undefined, workingDir: undefined });
  });

  it('does nothing for an empty draft', () => {
    const send = vi.fn();
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: null }));
    act(() => result.current.start('   '));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  it('reports a backend error and a rejected request', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ status: 'error', error: 'empty-result' })
      .mockRejectedValueOnce(new Error('Request timeout'));
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: null }));

    act(() => result.current.start('x'));
    await waitFor(() => expect(result.current.state).toMatchObject({ phase: 'error', error: 'empty-result' }));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toMatchObject({ phase: 'error', error: 'Request timeout' }));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drops an answer that arrives after the dialog was closed', async () => {
    const pending = deferred<{ status: string; enhancedPrompt: string }>();
    const send = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: null }));

    act(() => result.current.start('x'));
    act(() => result.current.close());
    await act(async () => { pending.resolve({ status: 'ok', enhancedPrompt: 'late' }); });

    expect(result.current.state.phase).toBe('idle');
  });

  it('keeps only the newest answer when retried while one is out', async () => {
    const first = deferred<{ status: string; enhancedPrompt: string }>();
    const second = deferred<{ status: string; enhancedPrompt: string }>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: null }));

    act(() => result.current.start('x'));
    act(() => result.current.start('x'));
    await act(async () => { second.resolve({ status: 'ok', enhancedPrompt: 'second' }); });
    await act(async () => { first.resolve({ status: 'ok', enhancedPrompt: 'first' }); });

    expect(result.current.state.enhanced).toBe('second');
  });

  it('follows edits to the rewrite', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', enhancedPrompt: 'Better' });
    const { result } = renderHook(() => usePromptEnhancer({ send, workingDirectory: '/p', model: 'opus', editorContext: null }));
    act(() => result.current.start('x'));
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    act(() => result.current.setEnhanced('Better still'));
    expect(result.current.state.enhanced).toBe('Better still');
  });
});
