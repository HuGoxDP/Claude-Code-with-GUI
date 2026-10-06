/**
 * The backend-owned queue behind the "queue" composer follow-up setting.
 *
 * Mirrors `afterTurn.test.ts`'s style: this module holds data only, so these
 * tests exercise enqueue/dequeue/remove/clear directly, without a CLI process
 * or a WebSocket connection anywhere in the picture.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueMessage,
  removeQueuedMessage,
  getQueuedMessages,
  dequeueNextMessage,
  clearQueuedMessages,
  clearAllQueuedMessages,
  reorderQueuedMessages,
  type QueuedMessageEntry,
} from '../messageQueue';

beforeEach(() => clearAllQueuedMessages());

function entry(id: string, content: string): QueuedMessageEntry {
  return { id, content, queuedAt: 0 };
}

describe('holding a message in the explicit queue', () => {
  it('lists what was queued, oldest first', () => {
    enqueueMessage('sess-1', entry('a', 'first'));
    enqueueMessage('sess-1', entry('b', 'second'));

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['first', 'second']);
  });

  it('lists nothing for a session that queued nothing', () => {
    expect(getQueuedMessages('sess-quiet')).toEqual([]);
  });

  it('keeps sessions apart', () => {
    enqueueMessage('sess-1', entry('a', 'for one'));
    enqueueMessage('sess-2', entry('b', 'for two'));

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['for one']);
    expect(getQueuedMessages('sess-2').map(e => e.content)).toEqual(['for two']);
  });
});

describe('cancelling a queued message', () => {
  it('removes the matching entry and leaves the rest', () => {
    enqueueMessage('sess-1', entry('a', 'keep'));
    enqueueMessage('sess-1', entry('b', 'cancel me'));
    enqueueMessage('sess-1', entry('c', 'keep too'));

    const removed = removeQueuedMessage('sess-1', 'b');

    expect(removed).toBe(true);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a', 'c']);
  });

  it('reports false for an id that is not queued', () => {
    enqueueMessage('sess-1', entry('a', 'keep'));

    expect(removeQueuedMessage('sess-1', 'missing')).toBe(false);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a']);
  });

  it('reports false for a session with no queue at all', () => {
    expect(removeQueuedMessage('sess-empty', 'a')).toBe(false);
  });
});

describe('releasing the next queued message at the end of a turn', () => {
  it('hands back the oldest entry and leaves the rest queued', () => {
    enqueueMessage('sess-1', entry('a', 'first'));
    enqueueMessage('sess-1', entry('b', 'second'));

    const released = dequeueNextMessage('sess-1');

    expect(released?.content).toBe('first');
    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['second']);
  });

  it('hands back undefined for a session with nothing queued', () => {
    expect(dequeueNextMessage('sess-quiet')).toBeUndefined();
  });

  it('hands each entry back once', () => {
    enqueueMessage('sess-1', entry('a', 'only'));
    dequeueNextMessage('sess-1');

    expect(dequeueNextMessage('sess-1')).toBeUndefined();
    expect(getQueuedMessages('sess-1')).toEqual([]);
  });
});

describe('dropping a dead session\'s queue', () => {
  it('clears everything held for it', () => {
    enqueueMessage('sess-1', entry('a', 'notice'));

    clearQueuedMessages('sess-1');

    expect(getQueuedMessages('sess-1')).toEqual([]);
    expect(dequeueNextMessage('sess-1')).toBeUndefined();
  });

  it('leaves other sessions untouched', () => {
    enqueueMessage('sess-1', entry('a', 'for one'));
    enqueueMessage('sess-2', entry('b', 'for two'));

    clearQueuedMessages('sess-1');

    expect(getQueuedMessages('sess-2').map(e => e.content)).toEqual(['for two']);
  });
});

describe('reordering the queue', () => {
  const ids = () => getQueuedMessages('s').map(e => e.id);
  beforeEach(() => {
    enqueueMessage('s', entry('a', 'first'));
    enqueueMessage('s', entry('b', 'second'));
    enqueueMessage('s', entry('c', 'third'));
  });

  it('puts the entries in the given order, so the first is released next', () => {
    expect(reorderQueuedMessages('s', ['c', 'a', 'b'])).toBe(true);
    expect(ids()).toEqual(['c', 'a', 'b']);
    expect(dequeueNextMessage('s')?.content).toBe('third');
  });

  it('reports false when the order is the one already held', () => {
    expect(reorderQueuedMessages('s', ['a', 'b', 'c'])).toBe(false);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('skips an id that was released while the user was dragging', () => {
    dequeueNextMessage('s');
    expect(reorderQueuedMessages('s', ['c', 'a', 'b'])).toBe(true);
    expect(ids()).toEqual(['c', 'b']);
  });

  it('keeps an entry the list does not name, after the named ones, instead of dropping it', () => {
    enqueueMessage('s', entry('d', 'queued from another tab'));
    reorderQueuedMessages('s', ['b', 'a', 'c']);
    expect(ids()).toEqual(['b', 'a', 'c', 'd']);
  });

  it('never duplicates an entry named twice', () => {
    reorderQueuedMessages('s', ['b', 'b', 'a']);
    expect(ids()).toEqual(['b', 'a', 'c']);
  });

  it('leaves other sessions and an empty session alone', () => {
    enqueueMessage('t', entry('x', 'other'));
    reorderQueuedMessages('s', ['x', 'c']);
    expect(getQueuedMessages('t').map(e => e.id)).toEqual(['x']);
    expect(reorderQueuedMessages('none', ['a'])).toBe(false);
  });
});
