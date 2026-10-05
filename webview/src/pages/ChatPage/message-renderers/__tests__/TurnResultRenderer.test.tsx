import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TurnResultRenderer } from '../TurnResultRenderer';
import { MessageBubble } from '../../MessageBubble';
import { LoadedMessageType } from '../../../../dto/common';
import type { LoadedMessageDto } from '../../../../types';

const entry = (over: Partial<LoadedMessageDto> = {}) => ({
  type: LoadedMessageType.Result,
  uuid: 'r1',
  duration_ms: 9400,
  usage: { input_tokens: 2, cache_creation_input_tokens: 5728, cache_read_input_tokens: 11809, output_tokens: 58 },
  ...over,
}) as LoadedMessageDto;

describe('TurnResultRenderer', () => {
  it('says how long the turn took and the tokens it used, with the split on hover', () => {
    render(<TurnResultRenderer message={entry()} />);
    const line = screen.getByTestId('turn-result');
    expect(line.textContent).toContain('Took 0:09');
    expect(line.textContent).toContain('17.5K in · 58 out');
    expect(screen.getByTitle(/2 new, 5\.7K written to cache, 11\.8K read from cache\. Output: 58/)).toBeTruthy();
  });

  it('draws nothing for a turn without tokens', () => {
    const { container } = render(<TurnResultRenderer message={entry({ usage: { input_tokens: 0, output_tokens: 0 } })} />);
    expect(container.textContent).toBe('');
  });

  it('is what a result entry in the chat draws', () => {
    render(<MessageBubble message={entry()} />);
    expect(screen.getByTestId('turn-result')).toBeTruthy();
  });
});
