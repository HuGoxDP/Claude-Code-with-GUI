import { describe, it, expect } from 'vitest';
import {
  applyPromptOrder,
  arrangeByScope,
  isPromptSortableId,
  mergeVisibleOrder,
  promptIdsOfSortable,
  promptSortableId,
} from '../promptOrder';
import type { PromptScope, SavedPrompt, ScopedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: `${id} body`,
  createdAt: 1,
  updatedAt: 1,
});

const idsOf = (prompts: SavedPrompt[]) => prompts.map((p) => p.id);

describe('applyPromptOrder', () => {
  it('follows the order it is given', () => {
    const result = applyPromptOrder([prompt('a'), prompt('b'), prompt('c')], ['c', 'a', 'b']);

    expect(idsOf(result)).toEqual(['c', 'a', 'b']);
  });

  // A prompt the order has never heard of arrived after the user last arranged
  // the list. New prompts go on top everywhere else in the library.
  it('puts a prompt the order does not know at the top', () => {
    const result = applyPromptOrder([prompt('a'), prompt('b'), prompt('new')], ['b', 'a']);

    expect(idsOf(result)).toEqual(['new', 'b', 'a']);
  });

  it('keeps several unknown prompts in the order they came', () => {
    const result = applyPromptOrder([prompt('x'), prompt('y'), prompt('a')], ['a']);

    expect(idsOf(result)).toEqual(['x', 'y', 'a']);
  });

  // A deleted prompt leaves its id behind in the order, which must be harmless.
  it('ignores an id with no prompt behind it', () => {
    const result = applyPromptOrder([prompt('a'), prompt('b')], ['gone', 'b', 'a']);

    expect(idsOf(result)).toEqual(['b', 'a']);
  });

  it('does not change the list it was given', () => {
    const input = [prompt('a'), prompt('b')];
    applyPromptOrder(input, ['b', 'a']);

    expect(idsOf(input)).toEqual(['a', 'b']);
  });
});

describe('arrangeByScope', () => {
  const scoped = (id: string, scope: PromptScope): ScopedPrompt => ({ ...prompt(id), scope });
  const idsOfScoped = (prompts: ScopedPrompt[]) => prompts.map((p) => `${p.scope}:${p.id}`);

  // The panel is one list, and a project-specific phrase is the more specific
  // answer, which is the order it has always had.
  it('lists project prompts before global ones', () => {
    const result = arrangeByScope(
      [scoped('g1', 'global'), scoped('p1', 'project'), scoped('g2', 'global')],
      { global: [], project: [] },
    );

    expect(idsOfScoped(result)).toEqual(['project:p1', 'global:g1', 'global:g2']);
  });

  // The two scopes are separate stores with no order to share, so each follows
  // its own arrangement and never the other's.
  it('arranges each scope by its own order', () => {
    const result = arrangeByScope(
      [
        scoped('g1', 'global'),
        scoped('g2', 'global'),
        scoped('p1', 'project'),
        scoped('p2', 'project'),
      ],
      { global: ['g2', 'g1'], project: ['p2', 'p1'] },
    );

    expect(idsOfScoped(result)).toEqual(['project:p2', 'project:p1', 'global:g2', 'global:g1']);
  });

  it('puts a prompt it has no order for at the top of its own scope', () => {
    const result = arrangeByScope(
      [scoped('g1', 'global'), scoped('gNew', 'global'), scoped('p1', 'project')],
      { global: ['g1'], project: ['p1'] },
    );

    expect(idsOfScoped(result)).toEqual(['project:p1', 'global:gNew', 'global:g1']);
  });
});

describe('mergeVisibleOrder', () => {
  it('replaces the whole order when everything is on screen', () => {
    expect(mergeVisibleOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  // The user drags among what a search left on screen. The hidden card between
  // them must stay exactly where it was, and the shown cards re-sequence into
  // the slots shown cards already held.
  it('leaves hidden cards in their places', () => {
    // b is hidden; the user drags a below d.
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['c', 'd', 'a'])).toEqual(['c', 'b', 'd', 'a']);
  });

  it('changes nothing when the shown cards were not reordered', () => {
    expect(mergeVisibleOrder(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('sortable ids', () => {
  it('tells a prompt card from anything else the drag layer carries', () => {
    expect(isPromptSortableId(promptSortableId('global', 'p1'))).toBe(true);
    expect(isPromptSortableId('category-drop:c1')).toBe(false);
  });

  // The two sections are separate stores, so one prompt id can only be promised
  // unique inside one of them.
  it('tells the same prompt id apart across the two sections', () => {
    expect(promptSortableId('global', 'p1')).not.toBe(promptSortableId('project', 'p1'));
  });

  it('takes the prompt ids back out, keeping only the section asked for', () => {
    const ids = [
      promptSortableId('global', 'a'),
      promptSortableId('project', 'b'),
      promptSortableId('global', 'c'),
    ];

    expect(promptIdsOfSortable('global', ids)).toEqual(['a', 'c']);
    expect(promptIdsOfSortable('project', ids)).toEqual(['b']);
  });
});
