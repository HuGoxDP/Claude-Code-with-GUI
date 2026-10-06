import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { ChatInstructionsProvider, useOptionalChatInstructions } from '../ChatInstructionsContext';

let mockSessionId: string | null = null;
vi.mock('../SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: mockSessionId }),
}));

type Api = NonNullable<ReturnType<typeof useOptionalChatInstructions>>;
let api: Api;

function Probe() {
  api = useOptionalChatInstructions()!;
  return null;
}

const tree = () => (
  <ChatInstructionsProvider>
    <Probe />
  </ChatInstructionsProvider>
);

beforeEach(() => {
  mockSessionId = null;
});

describe('ChatInstructionsProvider', () => {
  it('hands the choice to the first message once, then holds nothing', () => {
    render(tree());
    act(() => api.setDraft({ id: 'p-1', name: 'Reviewer' }));
    let taken: ReturnType<Api['take']> = null;
    act(() => {
      taken = api.take();
    });
    expect(taken).toEqual({ id: 'p-1', name: 'Reviewer' });
    expect(api.draft).toBeNull();
    expect(api.take()).toBeNull();
  });

  it('reads the choice in the same tick it was made', () => {
    // The send that creates the session runs before any re-render.
    render(tree());
    let taken: ReturnType<Api['take']> = null;
    act(() => {
      api.setDraft({ id: 'p-2', name: 'Style' });
      taken = api.take();
    });
    expect(taken).toEqual({ id: 'p-2', name: 'Style' });
  });

  it('drops the choice when an existing session is opened from the empty screen', () => {
    const view = render(tree());
    act(() => api.setDraft({ id: 'p-1', name: 'Reviewer' }));
    mockSessionId = 'existing';
    view.rerender(tree());
    expect(api.draft).toBeNull();
  });
});
