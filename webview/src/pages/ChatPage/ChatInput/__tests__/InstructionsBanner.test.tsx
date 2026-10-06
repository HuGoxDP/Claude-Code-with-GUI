import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OPEN_INSTRUCTIONS_PICKER_EVENT } from '@/components/InstructionsPicker';

let mockSessionId: string | null = null;
let mockDraft: { id: string; name: string } | null = null;
const setDraft = vi.fn();

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: mockSessionId }),
}));
vi.mock('@/contexts/ChatInstructionsContext', () => ({
  useOptionalChatInstructions: () => ({ draft: mockDraft, setDraft, take: vi.fn() }),
}));

import { InstructionsBanner } from '../InstructionsBanner';

beforeEach(() => {
  mockSessionId = null;
  mockDraft = { id: 'p-1', name: 'Reviewer' };
  setDraft.mockReset();
});

describe('InstructionsBanner', () => {
  it('names the prompt the new conversation will start with', () => {
    render(<InstructionsBanner />);
    expect(screen.getByText('Starts with instructions:')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('is not shown once the conversation has started, or with nothing chosen', () => {
    mockSessionId = 's-1';
    const { rerender } = render(<InstructionsBanner />);
    expect(screen.queryByText('Reviewer')).toBeNull();
    mockSessionId = null;
    mockDraft = null;
    rerender(<InstructionsBanner />);
    expect(screen.queryByText('Starts with instructions:')).toBeNull();
  });

  it('clears the choice with X and reopens the picker with Change', () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, opened);
    render(<InstructionsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(opened).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(setDraft).toHaveBeenCalledWith(null);
    window.removeEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, opened);
  });
});
