import { describe, it, expect } from 'vitest';
import {
  buildEnhanceRequest,
  cleanEnhancedPrompt,
  ENHANCE_SYSTEM_PROMPT,
  MAX_SELECTED_TEXT_LENGTH,
} from '../prompt-enhancer';

describe('buildEnhanceRequest', () => {
  it('wraps the draft alone when there is no editor context', () => {
    expect(buildEnhanceRequest('fix it', null)).toBe('<draft>\nfix it\n</draft>');
  });

  it('adds the open file with its line range and the selection', () => {
    const request = buildEnhanceRequest('fix this', {
      filePath: 'src/a.ts',
      startLine: 3,
      endLine: 9,
      selectedText: 'const a = 1;',
    });
    expect(request).toContain('<editor-file>src/a.ts (lines 3-9)</editor-file>');
    expect(request).toContain('<editor-selection>\nconst a = 1;\n</editor-selection>');
  });

  it('cuts a long selection and says how much was left out', () => {
    const request = buildEnhanceRequest('x', { filePath: 'a.ts', selectedText: 'a'.repeat(MAX_SELECTED_TEXT_LENGTH + 50) });
    expect(request).toContain('… (50 more characters)');
  });

  it('skips an empty selection', () => {
    expect(buildEnhanceRequest('x', { filePath: 'a.ts', selectedText: '   ' })).not.toContain('editor-selection');
  });
});

describe('cleanEnhancedPrompt', () => {
  it('drops a preamble line', () => {
    expect(cleanEnhancedPrompt('Here is the improved prompt: Refactor the parser.')).toBe('Refactor the parser.');
    expect(cleanEnhancedPrompt('Enhanced prompt:\nRefactor the parser.')).toBe('Refactor the parser.');
  });

  it('unwraps a fence or tags around the whole answer', () => {
    expect(cleanEnhancedPrompt('```text\nRefactor the parser.\n```')).toBe('Refactor the parser.');
    expect(cleanEnhancedPrompt('<draft>Refactor the parser.</draft>')).toBe('Refactor the parser.');
  });

  it('removes quotes only when they wrap everything', () => {
    expect(cleanEnhancedPrompt('"Refactor the parser."')).toBe('Refactor the parser.');
    expect(cleanEnhancedPrompt('"a" and "b"')).toBe('"a" and "b"');
  });

  it('keeps code fences that are part of the prompt', () => {
    const text = 'Change the call:\n```ts\nfoo()\n```\nto bar().';
    expect(cleanEnhancedPrompt(text)).toBe(text);
  });
});

describe('ENHANCE_SYSTEM_PROMPT', () => {
  it('tells the model to keep the draft language and not to run the draft', () => {
    expect(ENHANCE_SYSTEM_PROMPT).toContain('same language as the draft');
    expect(ENHANCE_SYSTEM_PROMPT).toContain('Do not answer or carry out the draft');
  });
});
