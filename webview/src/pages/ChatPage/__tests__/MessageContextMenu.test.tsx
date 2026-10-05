import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { linkHrefAt, selectedTextIn, useMessageContextMenu } from '../MessageContextMenu';
import { QUOTE_IN_COMPOSER_EVENT } from '../quoteInComposer';

vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function Conversation() {
  const ref = useRef<HTMLDivElement>(null);
  const { onContextMenu, menu } = useMessageContextMenu(ref);
  return (
    <div>
      <div ref={ref} data-testid="conversation" onContextMenu={onContextMenu}>
        {menu}
        <p data-testid="reply">Use a token bucket for the rate limit.</p>
        <a href="https://example.com/docs" data-testid="link">docs</a>
        <a href="#section" data-testid="anchor">here</a>
      </div>
      <p data-testid="outside">outside the conversation</p>
    </div>
  );
}

/** Select the whole text of [node]. */
function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('the conversation context menu', () => {
  beforeEach(() => window.getSelection()?.removeAllRanges());
  afterEach(() => vi.restoreAllMocks());

  it('leaves a right-click with nothing to offer to the browser', () => {
    render(<Conversation />);
    const event = fireEvent.contextMenu(screen.getByTestId('reply'));
    expect(event).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers to copy a link, and only a link that points somewhere', () => {
    render(<Conversation />);
    expect(fireEvent.contextMenu(screen.getByTestId('anchor'))).toBe(true);

    expect(fireEvent.contextMenu(screen.getByTestId('link'))).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'messageMenu.copyLink' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'messageMenu.quote' })).toBeNull();
  });

  it('offers to quote or copy selected text, and quotes it into the composer', () => {
    render(<Conversation />);
    select(screen.getByTestId('reply'));
    expect(fireEvent.contextMenu(screen.getByTestId('reply'))).toBe(false);

    const listener = vi.fn();
    window.addEventListener(QUOTE_IN_COMPOSER_EVENT, listener);
    fireEvent.click(screen.getByRole('menuitem', { name: 'messageMenu.quote' }));
    window.removeEventListener(QUOTE_IN_COMPOSER_EVENT, listener);

    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ text: 'Use a token bucket for the rate limit.' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('copies the selected text', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Conversation />);
    select(screen.getByTestId('reply'));
    fireEvent.contextMenu(screen.getByTestId('reply'));

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'messageMenu.copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('Use a token bucket for the rate limit.');
  });

  it('lets Shift+right-click reach the browser menu', () => {
    render(<Conversation />);
    expect(fireEvent.contextMenu(screen.getByTestId('link'), { shiftKey: true })).toBe(true);
  });

  it('closes on Escape', () => {
    render(<Conversation />);
    fireEvent.contextMenu(screen.getByTestId('link'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('selectedTextIn', () => {
  it('ignores a selection outside the conversation', () => {
    render(<Conversation />);
    select(screen.getByTestId('outside'));
    expect(selectedTextIn(screen.getByTestId('conversation'))).toBe('');
  });
});

describe('linkHrefAt', () => {
  it('finds the link around a nested node', () => {
    const container = document.createElement('div');
    container.innerHTML = '<a href="https://x.dev"><code>x</code></a>';
    expect(linkHrefAt(container.querySelector('code'), container)).toBe('https://x.dev');
    expect(linkHrefAt(null, container)).toBeNull();
  });
});
