import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { ConversationSearch } from '../index';
import { OPEN_CONVERSATION_SEARCH_EVENT, isConversationSearchShortcut } from '../events';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <ConversationSearch rootRef={ref} />
      <div ref={ref}>
        <p>alpha beta alpha</p>
        <p>gamma alpha</p>
        <div data-search-skip>alpha in the composer</div>
      </div>
    </>
  );
}

function openBar() {
  act(() => {
    window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_SEARCH_EVENT));
  });
}

function type(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe('ConversationSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden until asked for', () => {
    render(<Harness />);
    expect(screen.queryByRole('search')).toBeNull();
    openBar();
    expect(screen.getByRole('search')).toBeDefined();
  });

  it('counts the transcript matches but not the composer', () => {
    render(<Harness />);
    openBar();
    type('alpha');
    expect(screen.getByTestId('conversation-search-status').textContent).toBe('1 of 3');
  });

  it('walks matches with Enter and Shift+Enter, wrapping around', () => {
    render(<Harness />);
    openBar();
    type('alpha');
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('conversation-search-status').textContent).toBe('2 of 3');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByTestId('conversation-search-status').textContent).toBe('3 of 3');
  });

  it('reports no results and invalid regexes', () => {
    render(<Harness />);
    openBar();
    type('delta');
    expect(screen.getByTestId('conversation-search-status').textContent).toBe('No results');
    fireEvent.click(screen.getByLabelText('Regular expression (Alt+R)'));
    type('(');
    expect(screen.getByTestId('conversation-search-status').textContent).toBe('Invalid regex');
  });

  it('toggles whole word with Alt+W and remembers it', () => {
    render(<Harness />);
    openBar();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'w', code: 'KeyW', altKey: true });
    expect(screen.getByLabelText('Whole word (Alt+W)').getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem('ccg.conversationSearch.options') ?? '{}').wholeWord).toBe(true);
  });

  it('closes on Escape', () => {
    render(<Harness />);
    openBar();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('search')).toBeNull();
  });
});

describe('isConversationSearchShortcut', () => {
  it('takes Mod+F only, leaving Find in Files alone', () => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? { metaKey: true } : { ctrlKey: true };
    expect(isConversationSearchShortcut(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', ...mod }))).toBe(true);
    expect(isConversationSearchShortcut(new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', shiftKey: true, ...mod }))).toBe(false);
    expect(isConversationSearchShortcut(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF' }))).toBe(false);
  });
});
