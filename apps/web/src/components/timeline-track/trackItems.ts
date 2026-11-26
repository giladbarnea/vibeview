import type { ContentBlock, Exchange, MessageResponse } from '../../types';
import { formatDay } from './format';
import { estimateTokens, messageText } from './tokens';

export interface TreeNode {
  key: string;
  label: string;
  /** One-line summary shown on the collapsed row; a tool call's input. */
  preview: string;
  /** A tool call's output, shown after its input as `input -> output`. */
  outputPreview?: string;
  /** Full content shown when the row is open. */
  body: string;
  /** Estimated tokens of this row and everything under it. */
  tokens: number;
  isError?: boolean;
  children?: TreeNode[];
}

/** An assistant text message with the tool calls since the previous message; trailing calls with no text get a segment without text. */
export interface Segment {
  key: string;
  /** The message this row stands for: the text's, or the first tool call's when there is no text. */
  messageUuid: string;
  text?: string;
  nodes: TreeNode[];
  /** Estimated tokens of the text, its tool calls, and the thinking among them (never shown). */
  tokens: number;
}

/** Flattens a tool_result's content (string or content blocks) to plain text. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content, null, 2);
  return content.map((block: ContentBlock) => block.text ?? `[${block.type}]`).join('\n');
}

/** The first non-blank line of a text. */
function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim()) ?? '';
}

/** A tool input's first string argument (command, path, pattern…), or its JSON when it has none. */
function inputPreview(input: ContentBlock['input']): string {
  const first = Object.values(input ?? {}).find((value) => typeof value === 'string');
  return typeof first === 'string' ? first : JSON.stringify(input ?? {});
}

function toolNode(key: string, block: ContentBlock, toolResults: Map<string, ContentBlock>): TreeNode {
  const result = toolResults.get(block.id ?? '');
  const input = JSON.stringify(block.input ?? {}, null, 2);
  const output = result ? resultText(result.content) : '(no result)';
  const preview = inputPreview(block.input);
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  return {
    key,
    label: block.name ?? 'tool',
    preview,
    outputPreview: firstLine(output),
    body: input,
    tokens: inputTokens + outputTokens,
    isError: result?.is_error,
    children: [
      { key: `${key}:in`, label: 'input', preview, body: input, tokens: inputTokens },
      {
        key: `${key}:out`,
        label: 'output',
        preview: firstLine(output),
        body: output,
        tokens: outputTokens,
        isError: result?.is_error,
      },
    ],
  };
}

/** One rendered line of the track, tagged with the context window it belongs to. */
export type TrackItem = { key: string; windowNumber: number } & (
  | { kind: 'boundary'; label: string }
  | { kind: 'day'; day: string }
  | {
      kind: 'prompt';
      exchange: Exchange;
      /** 1-based position of the prompt among the session's messages. */
      messageNumber: number | undefined;
      /** Estimated tokens of the prompt's own text; undefined when the exchange has no prompt. */
      promptTokens: number | undefined;
    }
  | { kind: 'segment'; segment: Segment; messageNumber: number | undefined }
);

/**
 * Builds the track's rows in one pass over the session. Tool calls wait for the
 * next assistant text, which becomes the row that owns them. A prompt that
 * arrives while the agent's turn continues (its last call stopped for tool use)
 * leaves them waiting; any other prompt, a context-window boundary, or the end
 * of the session closes them into a row without text.
 */
export function buildTrackItems(
  exchanges: Exchange[],
  messages: MessageResponse[],
  toolResults: Map<string, ContentBlock>,
): TrackItem[] {
  const messageNumbers = new Map(messages.map((message, i) => [message.uuid, i + 1]));
  const messagesByUuid = new Map(messages.map((message) => [message.uuid, message]));
  const items: TrackItem[] = [
    { kind: 'boundary', key: 'window-1', windowNumber: 1, label: 'Context window 1 · session start' },
  ];
  let windowNumber = 1;
  let pending: TreeNode[] = [];
  let pendingThinkingTokens = 0;
  let pendingUuid = '';
  let lastStopReason: string | undefined;

  const pushSegment = (segment: Segment) =>
    items.push({
      kind: 'segment',
      key: segment.key,
      windowNumber,
      segment,
      messageNumber: messageNumbers.get(segment.messageUuid),
    });
  const flushPending = () => {
    if (pending.length === 0) return;
    pushSegment({
      key: `${pending[0].key}:trailing`,
      messageUuid: pendingUuid,
      nodes: pending,
      tokens: pendingThinkingTokens + sumTokens(pending),
    });
    pending = [];
    pendingThinkingTokens = 0;
  };

  exchanges.forEach((exchange, position) => {
    if (lastStopReason !== 'tool_use') flushPending();
    const day = formatDay(exchange.startTime);
    if (day !== formatDay(exchanges[position - 1]?.startTime ?? ''))
      items.push({ kind: 'day', key: `day-${exchange.index}`, windowNumber, day });
    const prompt = messagesByUuid.get(exchange.messageUuids[0]);
    items.push({
      kind: 'prompt',
      key: `prompt-${exchange.index}`,
      windowNumber,
      exchange,
      messageNumber: messageNumbers.get(exchange.messageUuids[0]),
      promptTokens: prompt?.type === 'user' ? estimateTokens(messageText(prompt)) : undefined,
    });

    for (const message of exchange.messageUuids.flatMap((uuid) => messagesByUuid.get(uuid) ?? [])) {
      if (message.type === 'system' && message.content) {
        flushPending();
        windowNumber += 1;
        items.push({ kind: 'boundary', key: message.uuid, windowNumber, label: message.content });
        continue;
      }
      if (message.type === 'assistant') lastStopReason = message.message?.stop_reason;
      const content = message.message?.content ?? [];
      const blocks: ContentBlock[] = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
      blocks.forEach((block, i) => {
        const key = `${message.uuid}:${i}`;
        const text = block.text ?? '';
        if (block.type === 'text' && message.type === 'assistant' && text.trim()) {
          pushSegment({
            key,
            messageUuid: message.uuid,
            text,
            nodes: pending,
            tokens: estimateTokens(text) + pendingThinkingTokens + sumTokens(pending),
          });
          pending = [];
          pendingThinkingTokens = 0;
        } else if (block.type === 'thinking') {
          pendingThinkingTokens += estimateTokens(block.thinking ?? '');
        } else if (block.type === 'tool_use') {
          if (pending.length === 0) pendingUuid = message.uuid;
          pending.push(toolNode(key, block, toolResults));
        }
      });
    }
  });
  flushPending();
  return items;
}

function sumTokens(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + node.tokens, 0);
}
