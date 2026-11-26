import type { MessageResponse } from '../../types';

/**
 * Rough token count of a text, at about four characters per token.
 * Example: `estimateTokens('abcdefgh')` is `2`.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The text blocks of a message, joined.
 * Example: a message with content `[{type: 'text', text: 'hi'}, {type: 'tool_result'}]` gives `'hi'`.
 */
export function messageText(message: MessageResponse): string {
  const content = message.message?.content ?? '';
  if (typeof content === 'string') return content;
  return content.map((block) => block.text ?? '').join('\n');
}
