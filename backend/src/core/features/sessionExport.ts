import { basename, extname } from 'path';
import type { SessionMessage } from './loadSessionMessages';

/**
 * Session export — the GUI's `/export`.
 *
 * In the terminal, `/export` writes the conversation to a file. A stream-json
 * session refuses it ("isn't available in this environment"), so the GUI does
 * the same job itself: the conversation the user is looking at becomes either a
 * readable Markdown transcript, or the session's JSONL exactly as the CLI wrote
 * it (the original-data principle: that copy is byte-for-byte the source, no
 * entry is edited).
 */

export type SessionExportFormat = 'markdown' | 'jsonl';

export const SESSION_EXPORT_FORMATS: readonly SessionExportFormat[] = ['markdown', 'jsonl'];

export function isSessionExportFormat(value: unknown): value is SessionExportFormat {
  return typeof value === 'string' && (SESSION_EXPORT_FORMATS as readonly string[]).includes(value);
}

/** Longest tool input / result shown inline before it is cut. */
const TOOL_INPUT_LIMIT = 600;
const TOOL_RESULT_LIMIT = 2000;

/**
 * CLI-authored text that sits in a user slot without anyone having typed it —
 * the same set the prompt history skips (loadPromptHistory), minus the command
 * tags, which are rendered as the command the user ran instead.
 */
const CLI_NOISE = /^\s*(?:<local-command-stdout>|<local-command-stderr>|<task-notification>|<ide_opened_file>|<ide_selection>|<system-reminder>|<local-command-caveat>)/;

const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;

type Block = Record<string, unknown>;

function blocksOf(entry: SessionMessage): Block[] | string | null {
  const message = entry.message as { content?: unknown } | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((b): b is Block => !!b && typeof b === 'object');
  }
  return null;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… (${text.length - limit} more characters)`;
}

/** A fence long enough that the text inside cannot close it. */
function fence(text: string): string {
  let longest = 2;
  for (const match of text.matchAll(/`{3,}/g)) longest = Math.max(longest, match[0].length);
  return '`'.repeat(longest + 1);
}

function codeBlock(text: string, lang = ''): string {
  const f = fence(text);
  return `${f}${lang}\n${text}\n${f}`;
}

/** The text of a tool_result block's `content`, which is a string or text blocks. */
function toolResultText(block: Block): string {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is Block => !!b && typeof b === 'object')
    .map((b) => {
      if (b.type === 'text' && typeof b.text === 'string') return b.text;
      if (b.type === 'image') return '[image]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** One line naming what a tool was asked to do, CLI-style: `Bash(ls -la)`. */
export function describeToolUse(block: Block): string {
  const name = typeof block.name === 'string' ? block.name : 'Tool';
  const input = (block.input && typeof block.input === 'object' ? block.input : {}) as Record<string, unknown>;
  const primary = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']
    .map((key) => input[key])
    .find((value): value is string => typeof value === 'string' && value.trim() !== '');
  if (primary !== undefined) {
    const oneLine = primary.replace(/\s+/g, ' ').trim();
    return `${name}(${truncate(oneLine, 160)})`;
  }
  return name;
}

/** A slash command the user ran, from the CLI's `<command-name>` wrapper; null otherwise. */
function slashCommandOf(text: string): string | null {
  const name = text.match(COMMAND_NAME)?.[1]?.trim();
  if (!name) return null;
  const args = text.match(COMMAND_ARGS)?.[1]?.trim();
  const command = name.startsWith('/') ? name : `/${name}`;
  return args ? `${command} ${args}` : command;
}

interface Section {
  role: 'user' | 'assistant';
  parts: string[];
}

function userParts(entry: SessionMessage, results: Map<string, string>): string[] | null {
  if (entry.isMeta || entry.isCompactSummary || entry.isSidechain) return null;
  const blocks = blocksOf(entry);
  if (blocks === null) return null;

  if (typeof blocks === 'string') {
    if (CLI_NOISE.test(blocks)) return null;
    const command = slashCommandOf(blocks);
    if (command) return [`\`${command}\``];
    return blocks.trim() ? [blocks.trim()] : null;
  }

  const parts: string[] = [];
  let onlyToolResults = true;
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      // Shown under the tool call that asked for it, not as something the user said.
      if (typeof block.tool_use_id === 'string') results.set(block.tool_use_id, toolResultText(block));
      continue;
    }
    onlyToolResults = false;
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text;
      if (CLI_NOISE.test(text) || /^\s*\[Request interrupted by user/.test(text)) continue;
      const command = slashCommandOf(text);
      if (command) parts.push(`\`${command}\``);
      else if (text.trim()) parts.push(text.trim());
    } else if (block.type === 'image') {
      parts.push('*[image]*');
    } else if (block.type === 'document') {
      parts.push('*[document]*');
    }
  }
  if (onlyToolResults || parts.length === 0) return null;
  return parts;
}

function assistantParts(entry: SessionMessage, toolCalls: Map<string, { section: Section; index: number }>, section: Section): void {
  const blocks = blocksOf(entry);
  if (blocks === null) return;
  if (typeof blocks === 'string') {
    if (blocks.trim()) section.parts.push(blocks.trim());
    return;
  }
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      section.parts.push(block.text.trim());
    } else if (block.type === 'tool_use') {
      const input = block.input && typeof block.input === 'object' ? JSON.stringify(block.input, null, 2) : '';
      const lines = [`**⏺ ${describeToolUse(block)}**`];
      if (input && input !== '{}') {
        lines.push('', '<details><summary>Input</summary>', '', codeBlock(truncate(input, TOOL_INPUT_LIMIT), 'json'), '', '</details>');
      }
      section.parts.push(lines.join('\n'));
      if (typeof block.id === 'string') {
        toolCalls.set(block.id, { section, index: section.parts.length - 1 });
      }
    }
    // Thinking stays out: it is the model's scratch work, not the conversation.
  }
}

export interface SessionExportMeta {
  title: string;
  sessionId: string;
  workingDir: string;
  exportedAt: Date;
}

/**
 * Render the active chain as Markdown: a heading per speaker change, the user's
 * prompts and slash commands, the assistant's text, and each tool call with its
 * (truncated) result folded underneath.
 */
export function renderSessionMarkdown(chain: SessionMessage[], meta: SessionExportMeta): string {
  const sections: Section[] = [];
  const results = new Map<string, string>();
  const toolCalls = new Map<string, { section: Section; index: number }>();

  for (const entry of chain) {
    if (entry.type === 'user') {
      const parts = userParts(entry, results);
      if (!parts) continue;
      const last = sections[sections.length - 1];
      if (last?.role === 'user') last.parts.push(...parts);
      else sections.push({ role: 'user', parts });
    } else if (entry.type === 'assistant') {
      if (entry.isSidechain) continue;
      let last = sections[sections.length - 1];
      if (last?.role !== 'assistant') {
        last = { role: 'assistant', parts: [] };
        sections.push(last);
      }
      assistantParts(entry, toolCalls, last);
    }
  }

  // Fold each tool's result under its call.
  for (const [id, { section, index }] of toolCalls) {
    const result = results.get(id);
    if (result === undefined || !result.trim()) continue;
    section.parts[index] += `\n\n<details><summary>Result</summary>\n\n${codeBlock(truncate(result.trimEnd(), TOOL_RESULT_LIMIT))}\n\n</details>`;
  }

  const header = [
    `# ${meta.title.trim() || meta.sessionId}`,
    '',
    `- Session: \`${meta.sessionId}\``,
    `- Directory: \`${meta.workingDir}\``,
    `- Exported: ${meta.exportedAt.toISOString()}`,
  ];
  const body = sections
    .filter((s) => s.parts.length > 0)
    .map((s) => `## ${s.role === 'user' ? 'User' : 'Claude'}\n\n${s.parts.join('\n\n')}`);
  return `${[header.join('\n'), ...body].join('\n\n---\n\n')}\n`;
}

/** A file-name-safe version of a title, at most 60 characters. */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
}

/** The name the save dialog offers: the user's own name if they gave one, else title + format. */
export function exportFileName(
  format: SessionExportFormat,
  title: string,
  sessionId: string,
  requested?: string,
): string {
  const ext = format === 'jsonl' ? '.jsonl' : '.md';
  const asked = typeof requested === 'string' ? basename(requested.trim()) : '';
  if (asked && asked !== '.' && asked !== '..') {
    return extname(asked) ? asked : `${asked}${ext}`;
  }
  const slug = slugifyTitle(title);
  return `${slug || sessionId}${ext}`;
}

/** The format `/export <name>` implies: `.jsonl`/`.json` mean the raw transcript. */
export function formatForFileName(name: string | undefined, fallback: SessionExportFormat): SessionExportFormat {
  const ext = name ? extname(name.trim()).toLowerCase() : '';
  if (ext === '.jsonl' || ext === '.json') return 'jsonl';
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') return 'markdown';
  return fallback;
}
