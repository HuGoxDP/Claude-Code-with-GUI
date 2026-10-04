/**
 * Prompt enhancement: rewrite the draft in the composer into a clearer prompt
 * before it is sent. The user sees both versions and picks one, so nothing here
 * sends anything on its own.
 *
 * The model call is one `claude -p` (see claude-print.ts); this module owns what
 * goes into it and how the answer is cleaned up.
 */

/** What the editor contributes, when the user has the editor-context tag on. */
export interface EnhanceContext {
  /** Path of the file open in the editor, relative to the project when possible. */
  filePath?: string | null;
  /** The selected text, if any. */
  selectedText?: string | null;
  startLine?: number | null;
  endLine?: number | null;
}

/** The longest selection forwarded verbatim; the rest is cut and marked. */
export const MAX_SELECTED_TEXT_LENGTH = 4000;

export const ENHANCE_SYSTEM_PROMPT = [
  'You rewrite prompts that a developer is about to send to Claude Code, a coding agent working in their project.',
  'The message you receive contains the draft between <draft> tags, and sometimes the file and code the developer has open in their editor.',
  '',
  'Rewrite the draft so it is clearer, more specific and less ambiguous:',
  '1. Keep the developer\'s intent. Do not add goals they did not ask for.',
  '2. Replace vague references ("this", "this file", "here") with what the editor context shows, by file name, function or line range.',
  '3. Add the details and constraints an engineer would need: expected behaviour, what not to change, how to verify.',
  '4. Fix grammar and typos.',
  '5. Keep it concise. A short draft becomes a short prompt, not an essay.',
  '6. Do not paste the selected code into the prompt; refer to it by location.',
  '',
  'Output rules:',
  '- Output ONLY the rewritten prompt, ready to send.',
  '- No preamble such as "Here is the improved prompt", no explanations, no closing remarks.',
  '- No surrounding quotes, no code fence around the whole answer, no Markdown headings.',
  '- Do not answer or carry out the draft. Do not ask questions.',
  '- Write in the same language as the draft.',
].join('\n');

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}

/** The message sent on stdin: the draft, then the editor context when there is some. */
export function buildEnhanceRequest(draft: string, context?: EnhanceContext | null): string {
  const parts = [`<draft>\n${draft}\n</draft>`];

  const filePath = context?.filePath?.trim();
  if (filePath) {
    const start = context?.startLine;
    const end = context?.endLine;
    const range = typeof start === 'number' && typeof end === 'number' ? ` (lines ${start}-${end})` : '';
    parts.push(`<editor-file>${filePath}${range}</editor-file>`);
  }

  const selected = context?.selectedText;
  if (selected && selected.trim()) {
    parts.push(`<editor-selection>\n${truncate(selected, MAX_SELECTED_TEXT_LENGTH)}\n</editor-selection>`);
  }

  return parts.join('\n\n');
}

const PREAMBLE = /^(?:here(?:'s| is) (?:the |an |your )?(?:improved|enhanced|optimi[sz]ed|rewritten|refined) (?:version of the )?prompt|(?:improved|enhanced|optimi[sz]ed|rewritten|refined) prompt)\s*:\s*/i;

/**
 * Undo what models add despite being told not to: a "Here is the improved
 * prompt:" line, a code fence around the whole answer, the answer echoed back in
 * the request's own tags, wrapping quotes. Only wrappers that enclose the whole
 * answer are removed; text inside is left as written.
 */
export function cleanEnhancedPrompt(text: string): string {
  let out = text.trim();
  out = out.replace(PREAMBLE, '').trim();

  const fence = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(out);
  if (fence) out = (fence[1] as string).trim();

  const tagged = /^<(draft|prompt)>\s*([\s\S]*?)\s*<\/\1>$/i.exec(out);
  if (tagged) out = (tagged[2] as string).trim();

  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if ((first === '"' && last === '"') || (first === '“' && last === '”')) {
      const inner = out.slice(1, -1);
      // Only a pair that wraps everything: `"a" and "b"` keeps its quotes.
      if (!inner.includes(first) && !inner.includes(last)) out = inner.trim();
    }
  }
  return out;
}
