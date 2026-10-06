/**
 * An edit card's diff starts open or closed by Settings → Appearance → Chat →
 * Expand diffs (ported from CC GUI), and each card can be opened or closed on
 * its own from the caption.
 */
import {describe, it, expect, vi, beforeAll, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {EditRenderer} from '../EditRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';
import {SettingKey} from '@/types/settings';

let mockSettings: Record<string, unknown> | null = {};

vi.mock('@/contexts/SettingsContext', () => ({
    useSettingsOrNull: () => (mockSettings === null ? null : {settings: mockSettings}),
}));

vi.mock('@/adapters', () => ({
    getAdapter: () => ({openFile: vi.fn()}),
}));

vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/repo'}),
}));

// The diff draws only once its container measures at least 400px; jsdom
// reports 0, so both the observer and the first read report a real width.
beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
            this.cb([{contentRect: {width: 800}} as ResizeObserverEntry], this as never);
        }
        unobserve() {}
        disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({width: 800} as DOMRect);
});

beforeEach(() => {
    mockSettings = {};
});

const toolUse = Object.assign(new ToolUseBlockDto(), {
    type: ContentBlockType.ToolUse,
    id: 'tool_1',
    name: 'Edit',
    input: {file_path: '/repo/src/foo.ts', old_string: 'before', new_string: 'after'},
});

const toolResult = {
    message: {content: [{type: ContentBlockType.ToolResult, content: 'ok'}]},
    toolUseResult: {structuredPatch: [{lines: ['-before', '+after', '+more', ' context']}]},
} as unknown as LoadedMessageDto;

const caption = () => screen.getByRole('button', {name: /Modified/});

describe('EditRenderer — expand diffs', () => {
    it('shows the diff open by default, as it always did', () => {
        render(<EditRenderer toolUse={toolUse} toolResult={toolResult} />);
        expect(screen.getByText('before')).toBeInTheDocument();
        expect(caption()).toHaveAttribute('aria-expanded', 'true');
    });

    it('also opens with no settings provider at all', () => {
        mockSettings = null;
        render(<EditRenderer toolUse={toolUse} toolResult={toolResult} />);
        expect(screen.getByText('before')).toBeInTheDocument();
    });

    it('starts closed when the setting is off, still saying how much changed', () => {
        mockSettings = {[SettingKey.EXPAND_DIFFS]: false};
        render(<EditRenderer toolUse={toolUse} toolResult={toolResult} />);
        expect(screen.queryByText('before')).toBeNull();
        expect(caption()).toHaveAttribute('aria-expanded', 'false');
        expect(caption()).toHaveTextContent('+2');
        expect(caption()).toHaveTextContent('−1');
    });

    it('opens and closes one card from its caption', () => {
        mockSettings = {[SettingKey.EXPAND_DIFFS]: false};
        render(<EditRenderer toolUse={toolUse} toolResult={toolResult} />);
        fireEvent.click(caption());
        expect(screen.getByText('before')).toBeInTheDocument();
        fireEvent.click(caption());
        expect(screen.queryByText('before')).toBeNull();
    });

    it('keeps a card the user opened open when the setting changes, and lets the rest follow', () => {
        mockSettings = {[SettingKey.EXPAND_DIFFS]: false};
        const {rerender} = render(
            <>
                <EditRenderer toolUse={toolUse} toolResult={toolResult} />
                <EditRenderer toolUse={{...toolUse, id: 'tool_2'} as ToolUseBlockDto} toolResult={toolResult} />
            </>,
        );
        fireEvent.click(screen.getAllByRole('button', {name: /Modified/})[0]);
        mockSettings = {[SettingKey.EXPAND_DIFFS]: true};
        rerender(
            <>
                <EditRenderer toolUse={toolUse} toolResult={toolResult} />
                <EditRenderer toolUse={{...toolUse, id: 'tool_2'} as ToolUseBlockDto} toolResult={toolResult} />
            </>,
        );
        expect(screen.getAllByText('before')).toHaveLength(2);
        mockSettings = {[SettingKey.EXPAND_DIFFS]: false};
        rerender(
            <>
                <EditRenderer toolUse={toolUse} toolResult={toolResult} />
                <EditRenderer toolUse={{...toolUse, id: 'tool_2'} as ToolUseBlockDto} toolResult={toolResult} />
            </>,
        );
        // The first was opened by hand and stays; the second follows the setting.
        expect(screen.getAllByText('before')).toHaveLength(1);
    });
});
