import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropProvider, useDragOperation, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useCategoryReorder } from '@/hooks/useCategoryReorder';
import { usePromptReorder } from '@/hooks/usePromptReorder';
import { categorySortableId, orderViewOf, promptSortableId } from '@/utils/promptOrder';
import { PROMPT_SENSORS } from '@/utils/promptSensors';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { ScopedPrompt } from '@/types/prompt';
import type { CategorySelection } from '@/utils/promptCategories';
import {
  CATEGORY_DROP_TYPE,
  CATEGORY_SORT_TYPE,
  PROMPT_DRAG_TYPE,
  PROMPT_NO_DRAG_ATTRIBUTE,
  acceptsDrop,
  categoriesAfterDrop,
  readCategoryDrop,
  readPromptDrag,
} from '@/utils/promptDrag';
import type { PanelCategoryRow, PromptPane, PromptRow } from './hooks/usePromptLibrary';

interface Props {
  rows: PromptRow[];
  /**
   * Every prompt of both scopes, for the order a drag changes. An order always
   * covers the whole set it belongs to, so a drag among the rows a search left on
   * screen can be folded back into it. Defaults to the prompts among `rows`.
   */
  allPrompts?: ScopedPrompt[];
  /** The prompts of the picked category whatever the search says. Defaults to the prompts among `rows`. */
  memberPrompts?: ScopedPrompt[];
  selectedIndex: number;
  isLoading: boolean;
  /** True once a load has resolved, so "no prompts yet" is only shown when true. */
  hasLoaded: boolean;
  /** The category column's rows. Empty when the user has made no categories. */
  categoryRows: PanelCategoryRow[];
  selectedCategory: CategorySelection;
  /** Which column the arrow keys are walking, so the right one can say so. */
  focusedPane: PromptPane;
  onSelectCategory: (key: CategorySelection) => void;
  /** File a dragged prompt under the category it was dropped on. */
  onFilePrompt: (prompt: ScopedPrompt, categoryIds: string[]) => void;
  onSelect: (index: number) => void;
  /** Open this prompt's edit screen in the library, without leaving the composer. */
  onEdit: (prompt: ScopedPrompt) => void;
  /** Remove this prompt, after asking. */
  onDelete: (prompt: ScopedPrompt) => void;
  /** The category whose name is being edited in place, or null. */
  editingCategory?: string | null;
  /** Save the edited name. Called by Enter, and by the field losing focus. */
  onRenameCategory?: (id: string, name: string) => void;
  /** Leave edit mode and keep the old name. Called by Escape. */
  onCancelCategoryEdit?: () => void;
  onClose: () => void;
}

/** A one-line preview of the prompt's text, for the row under its name. */
const PREVIEW_MAX_LENGTH = 80;

function preview(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX_LENGTH
    ? `${oneLine.slice(0, PREVIEW_MAX_LENGTH)}…`
    : oneLine;
}

/**
 * The prompt library panel, opened by `!!` in the composer.
 *
 * The chrome deliberately matches {@link MentionDropdown} — the sibling that
 * shares this slot — rather than inventing its own height cap and scroll
 * behaviour. Two panels opening in the same place at different sizes reads as a
 * defect on its own (issue #314).
 *
 * A user who files their prompts under categories gets a second column here,
 * the same split and the same two shapes the library modal uses, so the two
 * screens are one screen learned once. A user who files nothing gets the panel
 * exactly as it was.
 */
export function PromptDropdown(props: Props) {
  const {
    rows,
    allPrompts,
    memberPrompts,
    selectedIndex,
    isLoading,
    hasLoaded,
    categoryRows,
    selectedCategory,
    focusedPane,
    onSelectCategory,
    onFilePrompt,
    onSelect,
    onEdit,
    onDelete,
    editingCategory = null,
    onRenameCategory,
    onCancelCategoryEdit,
    onClose,
  } = props;
  const { t } = useTranslation('chat');
  // The category wording belongs to the library, and must read the same here.
  const { t: tCommon } = useTranslation('common');

  const listRef = useRef<HTMLUListElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

  // Keep the selected row visible once the list scrolls.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // The same for the category column, which scrolls sideways when narrow: the
  // arrows can walk it past its own edge just as easily as they can the list.
  useEffect(() => {
    const selected = categoryListRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedCategory]);

  const promptRowCount = rows.filter(row => row.kind === 'prompt').length;
  const hasCategories = categoryRows.length > 0;

  /**
   * The rows as they are DRAWN, which differs from `rows` only while a prompt is
   * being dragged: the neighbours are previewed sliding aside, the way the
   * library modal does it, with the same shared order behind both.
   *
   * `rows` stays the source of truth for which row is selected and for what
   * picking one means, because the keyboard and the paste both address a row by
   * its place in it. A drawn row is therefore mapped back to its place in `rows`
   * rather than trusting that the two lists agree.
   */
  const rowPrompts = rows.flatMap((row) => (row.kind === 'prompt' ? [row.prompt] : []));
  const keyOf = (prompt: ScopedPrompt) => `${prompt.scope}:${prompt.id}`;
  const shownKeys = new Set(rowPrompts.map(keyOf));
  const memberKeys = new Set((memberPrompts ?? rowPrompts).map(keyOf));
  const inScope = (scope: ScopedPrompt['scope']) =>
    (allPrompts ?? rowPrompts).filter((prompt) => prompt.scope === scope);
  const reorder = usePromptReorder(
    { global: inScope('global'), project: inScope('project') },
    {
      isShown: (prompt) => shownKeys.has(keyOf(prompt)),
      isMember: (prompt) => memberKeys.has(keyOf(prompt)),
      view: orderViewOf(selectedCategory),
    },
  );
  const drawn: PromptRow[] = [
    ...[...reorder.lists.project, ...reorder.lists.global].map(
      (prompt): PromptRow => ({ kind: 'prompt', prompt }),
    ),
    ...rows.filter((row) => row.kind === 'create'),
  ];
  // The category chips as drawn, for the same reason: the column is previewed
  // sliding aside while a chip is held. "All" is a chip of the column like the
  // others and sorts with them, so it is drawn at the place the order gives it.
  const categoryReorder = useCategoryReorder(
    categoryRows.flatMap((row) => (row.category ? [row.category] : [])),
  );
  const allChip = categoryRows.find((row) => !row.category);
  const drawnCategories = categoryReorder.categories.flatMap((category) => {
    const row = categoryRows.find((candidate) => candidate.category?.id === category.id);
    return row ? [row] : [];
  });
  const drawnCategoryRows: PanelCategoryRow[] = [
    ...drawnCategories.slice(0, categoryReorder.allIndex),
    ...(allChip ? [allChip] : []),
    ...drawnCategories.slice(categoryReorder.allIndex),
  ];
  const rowsIndexOf = (drawnRow: PromptRow) =>
    rows.findIndex((row) =>
      row.kind === 'create'
        ? drawnRow.kind === 'create'
        : drawnRow.kind === 'prompt' &&
          row.prompt.id === drawnRow.prompt.id &&
          row.prompt.scope === drawnRow.prompt.scope,
    );

  /**
   * File a prompt by dropping it on a category chip.
   *
   * `categoriesAfterDrop` decides what the drop means, and the library modal
   * asks the same function, so the gesture means the same thing on both
   * screens. A null answer means nothing would change and no write happens.
   */
  const handleDrop = (event: DragEndEvent) => {
    if (event.canceled) return;
    const dragged = readPromptDrag(event.operation.source?.data);
    const onto = readCategoryDrop(event.operation.target?.data);
    if (!dragged || !onto) return;
    const next = categoriesAfterDrop(dragged.categories, onto.key);
    if (next === null) return;
    const row = rows.find((r) => r.kind === 'prompt' && r.prompt.id === dragged.promptId);
    if (row?.kind === 'prompt') onFilePrompt(row.prompt, next);
  };

  return (
    <DragDropProvider
      sensors={PROMPT_SENSORS}
      onDragOver={(event) => {
        // Each handler looks only at its own kind of drag.
        reorder.onDragOver(event);
        categoryReorder.onDragOver(event);
      }}
      onDragEnd={(event) => {
        // One drop is one of three things, decided by what was held and where it
        // landed: a row among the rows reorders them, a row on a chip files it,
        // a chip among the chips reorders the column.
        reorder.onDragEnd(event);
        categoryReorder.onDragEnd(event);
        handleDrop(event);
      }}
    >
    <div className="w-full bg-surface-overlay border border-border-default rounded-md shadow-lg overflow-hidden">
      {isLoading && promptRowCount === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">
          {t('chatInput.promptDropdown.loading')}
        </div>
      ) : (
          <div className="flex flex-col sm:flex-row">
            {hasCategories && (
              /* Two shapes, the same two the library modal takes: a column
                 beside the list when there is room for two, and a strip above
                 it scrolling sideways when there is not. Capped in height
                 either way, so twenty categories never push the prompts out of
                 a panel that is already only 200px tall. */
              <div
                ref={categoryListRef}
                className="flex max-h-14 shrink-0 flex-row gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle p-1.5 sm:max-h-[200px] sm:w-32 sm:min-w-24 sm:max-w-40 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-e"
              >
                {drawnCategoryRows.map((row) =>
                  row.category && row.key === editingCategory ? (
                    <PanelCategoryNameField
                      key={row.key}
                      initialName={row.category.name}
                      onCommit={(name) => onRenameCategory?.(row.category!.id, name)}
                      onCancel={() => onCancelCategoryEdit?.()}
                    />
                  ) : (
                  <PanelCategoryChip
                    key={row.key}
                    row={row}
                    sortIndex={drawnCategoryRows.findIndex((candidate) => candidate.key === row.key)}
                    label={row.category?.name ?? tCommon('promptLibrary.allCategories')}
                    isSelected={row.key === selectedCategory}
                    isFocusedPane={focusedPane === 'categories'}
                    onSelect={onSelectCategory}
                  />
                  ),
                )}
              </div>
            )}

            {/* The empty notice belongs to the list, not to the panel: it is the
                picked category that has nothing in it, and saying so across both
                columns would read as if the whole library were empty. */}
            <div className="min-w-0 flex-1 overflow-y-auto max-h-[200px]">
            {hasLoaded && promptRowCount === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">
                {t('chatInput.promptDropdown.noPrompts')}
              </div>
            )}
            <ul ref={listRef}>
              {drawn.map((row) => {
                const index = rowsIndexOf(row);
                return (
                <li key={row.kind === 'prompt' ? `${row.prompt.scope}:${row.prompt.id}` : 'create'}>
                  {row.kind === 'create' ? (
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs ${
                        index === selectedIndex
                          ? 'bg-surface-selected text-text-primary'
                          : 'text-text-secondary hover:bg-surface-selected/60'
                      } ${
                        index === selectedIndex && hasCategories && focusedPane === 'prompts'
                          ? 'ring-1 ring-inset ring-border-focus'
                          : ''
                      }`}
                      onMouseDown={(e) => {
                        // mousedown, not click: the composer's blur must not fire first.
                        e.preventDefault();
                        onSelect(index);
                      }}
                    >
                      <span className="flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                      <span className="truncate">{t('chatInput.promptDropdown.createPrompt')}</span>
                    </button>
                  ) : (
                    <PanelPromptRow
                      prompt={row.prompt}
                      sortIndex={reorder.lists[row.prompt.scope].findIndex(
                        (candidate) => candidate.id === row.prompt.id,
                      )}
                      isSelected={index === selectedIndex}
                      isRinged={index === selectedIndex && hasCategories && focusedPane === 'prompts'}
                      onSelect={() => onSelect(index)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  )}
                </li>
                );
              })}
            </ul>
            </div>
          </div>
      )}
      <button
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={t('chatInput.promptDropdown.closeAriaLabel')}
      />
    </div>
    </DragDropProvider>
  );
}

interface PanelCategoryNameFieldProps {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * A category's name being edited in place, where its chip was.
 *
 * Enter saves and Escape puts the old name back, the same two answers the
 * library modal's category column gives. Every key stops here: the field has the
 * focus instead of the composer while it is open, and a key it does not use must
 * not reach the composer or the key that stops a running response.
 */
function PanelCategoryNameField(props: PanelCategoryNameFieldProps) {
  const { initialName, onCommit, onCancel } = props;
  const [draft, setDraft] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Escape unmounts the field, which can fire a trailing blur that must not save. */
  const settled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save) onCommit(draft);
    else onCancel();
  };

  return (
    <div className="flex w-auto max-w-32 flex-shrink-0 items-center rounded bg-surface-selected px-2 py-1 text-xs ring-1 ring-border-focus sm:w-full sm:max-w-none">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
        className="w-full min-w-0 border-b border-text-tertiary/40 bg-transparent text-xs text-text-primary outline-none"
      />
    </div>
  );
}

interface PanelCategoryChipProps {
  row: PanelCategoryRow;
  /** Where the chip sits among the real categories, which the drag layer sorts by. */
  sortIndex: number;
  label: string;
  isSelected: boolean;
  isFocusedPane: boolean;
  onSelect: (key: CategorySelection) => void;
}

/**
 * One category chip, which is also somewhere a prompt can be dropped.
 *
 * A component of its own because each chip registers its own drop target and
 * hooks cannot be called in a loop. It lights up only when the drop would
 * actually change something, so "All" and the category a prompt already carries
 * stay dim rather than promising a write that never happens.
 */
function PanelCategoryChip(props: PanelCategoryChipProps) {
  // Every chip sorts, "All" included: it is fixed at priority 0 and the
  // categories sit above and below it.
  return <SortablePanelCategoryChip {...props} />;
}

/**
 * A chip (a category, or "All") that can also be dragged to a new place in the column.
 * The whole chip is the handle; it stays a drop target for prompts at the same
 * time, and the two are told apart by drag type.
 */
function SortablePanelCategoryChip(props: PanelCategoryChipProps) {
  const { ref, isDragging } = useSortable({
    id: categorySortableId(String(props.row.key)),
    index: props.sortIndex,
    type: CATEGORY_SORT_TYPE,
    accept: CATEGORY_SORT_TYPE,
  });
  return <PanelCategoryChipFrame {...props} sortRef={ref} isDragging={isDragging} />;
}

interface PanelCategoryChipFrameProps extends PanelCategoryChipProps {
  /** Present on a real category: makes the chip sortable as well as droppable. */
  sortRef?: (element: Element | null) => void;
  isDragging?: boolean;
}

function PanelCategoryChipFrame(props: PanelCategoryChipFrameProps) {
  const { row, label, isSelected, isFocusedPane, onSelect, sortRef, isDragging = false } = props;

  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `panel-category-drop:${row.key}`,
    type: CATEGORY_DROP_TYPE,
    accept: PROMPT_DRAG_TYPE,
    data: { key: row.key },
  });
  const { source } = useDragOperation();
  const dragged = readPromptDrag(source?.data);
  const wouldAccept = dragged !== null && acceptsDrop(dragged.categories, row.key);

  // One element, two registrations: a place prompts can be dropped, and (for a
  // real category) an item in the sortable column. Memoised, because a new ref
  // function every render would make the drag layer unregister and register the
  // chip again each time.
  const setRefs = useCallback(
    (element: HTMLButtonElement | null) => {
      dropRef(element);
      sortRef?.(element);
    },
    [dropRef, sortRef],
  );

  return (
    <button
      ref={setRefs}
      type="button"
      // `aria-current`, not `aria-pressed`: the drag layer owns `aria-pressed` on
      // anything it can pick up and sets it to "is this being dragged right now",
      // so a selection written there would be overwritten.
      aria-current={isSelected ? 'true' : undefined}
      title={label}
      onMouseDown={(e) => {
        // Keep focus in the composer. Selecting happens on click, below, so that a
        // press that turns out to be the start of a drag does not select first.
        e.preventDefault();
      }}
      onClick={() => onSelect(row.key)}
      className={`flex w-auto max-w-32 flex-shrink-0 items-center gap-1 rounded px-2 py-1 text-start text-xs transition-colors sm:w-full sm:max-w-none ${
        isSelected
          ? 'bg-surface-selected text-text-primary'
          : 'text-text-secondary hover:bg-surface-selected/60'
      } ${
        // Which column the arrows are walking. Without it both columns show a
        // highlight and neither says which one Up and Down would move.
        isSelected && isFocusedPane ? 'ring-1 ring-border-focus' : ''
      } ${isDropTarget && wouldAccept ? 'ring-1 ring-accent-primary bg-accent-primary/10' : ''} ${
        dragged !== null && !wouldAccept ? 'opacity-40' : ''
      } ${
        // Only a real category can be picked up, so only it shows the grab hand.
        'cursor-grab active:cursor-grabbing'
      } ${
        // Lifted while held, and above the chips it passes rather than under them.
        isDragging ? 'relative z-10 bg-surface-overlay shadow-lg' : ''
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex-shrink-0 text-text-tertiary">({row.count})</span>
    </button>
  );
}

interface PanelPromptRowProps {
  prompt: ScopedPrompt;
  /** Where the row sits among the prompts of its own scope, which the drag layer sorts by. */
  sortIndex: number;
  isSelected: boolean;
  isRinged: boolean;
  onSelect: () => void;
  onEdit: (prompt: ScopedPrompt) => void;
  onDelete: (prompt: ScopedPrompt) => void;
}

/**
 * One prompt row, which can also be dragged onto a category chip.
 *
 * The whole row is the drag handle, with a grab cursor over all of it, so the
 * row itself is what follows the pointer. The row's body is a button that pastes
 * the prompt, which is why picking happens on `click` rather than on `mousedown`:
 * a press has to stay undecided between "pick this" and "start dragging this"
 * until the pointer has either travelled or been released, and picking on the
 * press itself decided it before the user had done either. The drag layer holds
 * the click back once a drag has begun, so finishing a drag never pastes.
 *
 * `mousedown` is still swallowed on the body, but only to keep focus in the
 * composer: letting it through would blur the composer before the click landed.
 *
 * Edit and delete are real <button>s, marked as no-drag, since a press on them
 * can only mean a click.
 */
function PanelPromptRow(props: PanelPromptRowProps) {
  const { prompt, sortIndex, isSelected, isRinged, onSelect, onEdit, onDelete } = props;
  const { t } = useTranslation('chat');

  // Sortable rather than merely draggable: a row that is only draggable leaves
  // its neighbours where they are, so there is nothing to show where the row
  // would land. As in the library modal, a row accepts only drops from its own
  // scope, since the two scopes keep separate orders.
  const { ref: dragRef, isDragging } = useSortable({
    id: promptSortableId(prompt.scope, prompt.id),
    index: sortIndex,
    group: prompt.scope,
    type: PROMPT_DRAG_TYPE,
    accept: (source) => readPromptDrag(source.data)?.scope === prompt.scope,
    data: { promptId: prompt.id, scope: prompt.scope, categories: prompt.categories ?? [] },
  });

  return (
    <div
      ref={dragRef}
      className={`group/row flex w-full cursor-grab items-center gap-2 px-3 py-1.5 text-xs active:cursor-grabbing ${
        isDragging
          ? // Lifted while held: fully opaque, so the rows it passes over do not
            // show through its text, and above them rather than painted under.
            'relative z-10 bg-surface-overlay text-text-primary shadow-lg ring-1 ring-inset ring-border-focus'
          : `${
              isSelected
                ? 'bg-surface-selected text-text-primary'
                : 'text-text-secondary hover:bg-surface-selected/60'
            } ${isRinged ? 'ring-1 ring-inset ring-border-focus' : ''}`
      }`}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          // Keep focus in the composer. Picking happens on click, below.
          e.preventDefault();
        }}
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-[inherit] items-center gap-2 text-start"
      >
        {/* The name gets a quarter of the row and the content gets the rest.
            The name is only there to tell the prompts apart at a glance; the
            content is the thing the user is about to paste, so it is the one
            that needs the room. (They used to split the row evenly.)

            The name also carries the hierarchy by WEIGHT, so the preview and
            scope beside it can stay readable instead of being dimmed into the
            background. They were on `text-disabled` (82/255 in dark), the
            dimmest token we have, and could not be read at a glance. */}
        <span className="truncate w-1/4 flex-shrink-0 font-medium">{prompt.name}</span>
        {/* Hovering the preview shows the whole prompt, line breaks and all:
            one truncated line cannot tell the user what they are about to
            paste. */}
        <Tooltip content={prompt.content}>
          <span className="truncate text-text-tertiary flex-1 hidden sm:inline">
            {preview(prompt.content)}
          </span>
        </Tooltip>
      </button>

      {/* The scope label and the two actions share one slot: the label says
          where the prompt lives, which matters while reading the list, and the
          actions matter only once the pointer has settled on a row. Swapping
          them keeps the row one line wide either way. */}
      <span className="relative flex-shrink-0 text-text-tertiary">
        <span className="group-hover/row:invisible">
          {prompt.scope === 'project'
            ? t('chatInput.promptDropdown.scopeProject')
            : t('chatInput.promptDropdown.scopeGlobal')}
        </span>
        <span
          {...{ [PROMPT_NO_DRAG_ATTRIBUTE]: '' }}
          className="absolute inset-y-0 end-0 hidden cursor-pointer items-center gap-0.5 group-hover/row:flex"
        >
          <button
            type="button"
            title={t('chatInput.promptDropdown.editPrompt')}
            aria-label={t('chatInput.promptDropdown.editPrompt')}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(prompt);
            }}
            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('chatInput.promptDropdown.deletePrompt')}
            aria-label={t('chatInput.promptDropdown.deletePrompt')}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(prompt);
            }}
            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-state-error-fg"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    </div>
  );
}
