import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import Tippy from '@tippyjs/react/headless';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { requestQuote } from './quoteInComposer';

/** Shared with SendActionMenu so the two menus in the chat look the same. */
const itemClass =
  'w-full text-start px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors cursor-pointer';

/** What was under the pointer when the menu opened. */
export interface MessageMenuTarget {
  x: number;
  y: number;
  /** The text selected inside the conversation, or '' when nothing is. */
  selectedText: string;
  /** The address of the link right-clicked, or null when it was not a link. */
  linkHref: string | null;
}

/**
 * The address a right-clicked link points at, or null when [target] is not
 * inside a link worth copying. In-page anchors and `javascript:` links are not:
 * their address means nothing outside this page.
 */
export function linkHrefAt(target: EventTarget | null, container: Element): string | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!anchor || !container.contains(anchor)) return null;
  const href = anchor.getAttribute('href')?.trim() ?? '';
  if (href === '' || href.startsWith('#') || /^javascript:/i.test(href)) return null;
  return href;
}

/** The text selected inside [container], or '' when the selection is empty or lies elsewhere. */
export function selectedTextIn(container: Element): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return '';
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) return '';
  return selection.toString().trim() === '' ? '' : selection.toString();
}

/**
 * The right-click menu of the conversation: "Copy link address" on a link, and
 * "Quote" and "Copy" for selected text. Ported from the CC GUI plugin.
 *
 * It opens only when it has something to offer. A right-click anywhere else,
 * or with Shift held, is left to the browser, so its own menu (and, in the
 * IDE, the developer tools entry) stays one gesture away.
 */
export function useMessageContextMenu(containerRef: RefObject<HTMLElement | null>) {
  const [target, setTarget] = useState<MessageMenuTarget | null>(null);
  const close = useCallback(() => setTarget(null), []);

  const onContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      const container = containerRef.current;
      if (!container || event.shiftKey) return;
      const linkHref = linkHrefAt(event.target, container);
      const selectedText = selectedTextIn(container);
      if (linkHref === null && selectedText === '') return;
      event.preventDefault();
      setTarget({ x: event.clientX, y: event.clientY, selectedText, linkHref });
    },
    [containerRef],
  );

  // The menu is anchored to a point on screen, which scrolling moves away from.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [target, close]);

  return { onContextMenu, menu: <MessageContextMenu target={target} onClose={close} /> };
}

interface MessageContextMenuProps {
  target: MessageMenuTarget | null;
  onClose: () => void;
}

export function MessageContextMenu({ target, onClose }: MessageContextMenuProps) {
  const { t } = useTranslation('chat');

  const copy = (text: string, done: string) => {
    onClose();
    navigator.clipboard.writeText(text).then(
      () => toast.success(done),
      () => toast.error(t('messageMenu.copyFailed')),
    );
  };

  const point = target ? { x: target.x, y: target.y } : { x: 0, y: 0 };

  return (
    <Tippy
      visible={target !== null}
      onClickOutside={onClose}
      interactive
      placement="bottom-start"
      offset={[0, 2]}
      appendTo={() => document.body}
      getReferenceClientRect={() => new DOMRect(point.x, point.y, 0, 0)}
      render={(attrs) =>
        target && (
          <div
            role="menu"
            aria-label={t('messageMenu.label')}
            className="w-max max-w-[16rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50"
            {...attrs}
          >
            {target.linkHref !== null && (
              <button type="button" role="menuitem" className={itemClass} onClick={() => copy(target.linkHref!, t('messageMenu.linkCopied'))}>
                {t('messageMenu.copyLink')}
              </button>
            )}
            {target.selectedText !== '' && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    onClose();
                    requestQuote(target.selectedText);
                  }}
                >
                  {t('messageMenu.quote')}
                </button>
                <button type="button" role="menuitem" className={itemClass} onClick={() => copy(target.selectedText, t('messageMenu.textCopied'))}>
                  {t('messageMenu.copy')}
                </button>
              </>
            )}
          </div>
        )
      }
    >
      {/* Tippy needs a child to mount; the menu itself is placed by getReferenceClientRect. */}
      <span hidden />
    </Tippy>
  );
}
