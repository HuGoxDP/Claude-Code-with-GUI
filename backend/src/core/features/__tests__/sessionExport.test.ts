import { describe, it, expect } from 'vitest';
import {
  describeToolUse,
  exportFileName,
  formatForFileName,
  isSessionExportFormat,
  renderSessionMarkdown,
  slugifyTitle,
} from '../sessionExport';
import type { SessionMessage } from '../loadSessionMessages';

const META = {
  title: 'Fix the login bug',
  sessionId: 'abc-123',
  workingDir: '/home/me/project',
  exportedAt: new Date('2026-10-04T12:00:00Z'),
};

function user(uuid: string, content: unknown, extra: Record<string, unknown> = {}): SessionMessage {
  return { type: 'user', uuid, message: { role: 'user', content }, ...extra };
}

function assistant(uuid: string, content: unknown[]): SessionMessage {
  return { type: 'assistant', uuid, message: { role: 'assistant', content } };
}

describe('renderSessionMarkdown', () => {
  it('writes a header and alternating speaker sections', () => {
    const md = renderSessionMarkdown([
      user('u1', 'Why does login fail?'),
      assistant('a1', [{ type: 'thinking', thinking: 'secret scratch work' }]),
      assistant('a2', [{ type: 'text', text: 'Let me look.' }]),
      assistant('a3', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }]),
      user('u2', [{ type: 'tool_result', tool_use_id: 't1', content: '1 failing' }]),
      assistant('a4', [{ type: 'text', text: 'The token check is inverted.' }]),
      user('u3', [{ type: 'text', text: 'Fix it' }, { type: 'image', source: {} }]),
    ], META);

    expect(md.startsWith('# Fix the login bug\n')).toBe(true);
    expect(md).toContain('- Session: `abc-123`');
    expect(md).toContain('- Directory: `/home/me/project`');
    // Tool results are folded under the call, not shown as a user turn.
    expect(md.match(/## User/g)).toHaveLength(2);
    expect(md.match(/## Claude/g)).toHaveLength(1);
    expect(md).toContain('**⏺ Bash(npm test)**');
    expect(md).toContain('<summary>Result</summary>');
    expect(md).toContain('1 failing');
    expect(md).toContain('The token check is inverted.');
    expect(md).toContain('*[image]*');
    // Thinking is the model's scratch work, not part of the conversation.
    expect(md).not.toContain('secret scratch work');
  });

  it('shows slash commands as commands and drops CLI-authored noise', () => {
    const md = renderSessionMarkdown([
      user('u1', '<command-name>/model</command-name>\n<command-args>opus</command-args>'),
      user('u2', '<local-command-stdout>Set model to opus</local-command-stdout>'),
      user('u3', 'skill preamble', { isMeta: true }),
      user('u4', [{ type: 'text', text: '[Request interrupted by user for tool use]' }]),
      assistant('a1', [{ type: 'text', text: 'ok' }]),
    ], META);
    expect(md).toContain('`/model opus`');
    expect(md).not.toContain('Set model to opus');
    expect(md).not.toContain('skill preamble');
    expect(md).not.toContain('Request interrupted');
  });

  it('truncates long tool results and survives backticks inside them', () => {
    const long = '```\n' + 'x'.repeat(5000);
    const md = renderSessionMarkdown([
      user('u1', 'go'),
      assistant('a1', [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a.ts' } }]),
      user('u2', [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: long }] }]),
    ], META);
    expect(md).toContain('more characters)');
    expect(md).toContain('````\n```');
  });

  it('falls back to the session id when there is no title', () => {
    const md = renderSessionMarkdown([user('u1', 'hi')], { ...META, title: '  ' });
    expect(md.startsWith('# abc-123\n')).toBe(true);
  });
});

describe('describeToolUse', () => {
  it('names the tool with its primary argument on one line', () => {
    expect(describeToolUse({ name: 'Bash', input: { command: 'ls\n  -la' } })).toBe('Bash(ls -la)');
    expect(describeToolUse({ name: 'Edit', input: { file_path: '/x.ts', old_string: 'a' } })).toBe('Edit(/x.ts)');
    expect(describeToolUse({ name: 'TodoWrite', input: { todos: [] } })).toBe('TodoWrite');
  });
});

describe('file names and formats', () => {
  it('builds a safe default name from the title', () => {
    expect(slugifyTitle('Fix: the "login" bug / today')).toBe('Fix-the-login-bug-today');
    expect(exportFileName('markdown', 'Fix the login bug', 'abc')).toBe('Fix-the-login-bug.md');
    expect(exportFileName('jsonl', '', 'abc')).toBe('abc.jsonl');
  });

  it('keeps a name the user typed, adding an extension only when missing', () => {
    expect(exportFileName('markdown', 't', 'abc', 'notes')).toBe('notes.md');
    expect(exportFileName('markdown', 't', 'abc', 'notes.txt')).toBe('notes.txt');
    // Only the file name part is taken: a path cannot steer the dialog elsewhere.
    expect(exportFileName('jsonl', 't', 'abc', '../../etc/raw.jsonl')).toBe('raw.jsonl');
  });

  it('derives the format from the extension', () => {
    expect(formatForFileName('chat.jsonl', 'markdown')).toBe('jsonl');
    expect(formatForFileName('chat.JSON', 'markdown')).toBe('jsonl');
    expect(formatForFileName('chat.md', 'jsonl')).toBe('markdown');
    expect(formatForFileName(undefined, 'markdown')).toBe('markdown');
    expect(isSessionExportFormat('jsonl')).toBe(true);
    expect(isSessionExportFormat('pdf')).toBe(false);
  });
});
