import type { ContentBlock, Exchange, MessageResponse, Usage } from '../../types';
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A structured value as one readable line: `key: value` pairs joined by ` · `,
 * arrays in square brackets with items joined by `, `, strings unquoted. An
 * object that is a key's value gets `{ }` so its pairs stay apart from its parent's.
 * Example: `{published: true, teams: [{teamName: 'a'}]}` gives
 * `published: true · teams: [ teamName: a ]`.
 */
export function formatStructured(value: unknown): string {
  if (Array.isArray(value))
    return value.length === 0 ? '[]' : `[ ${value.map(formatStructured).join(', ')} ]`;
  if (!isPlainObject(value)) return String(value);
  return Object.entries(value)
    .map(([key, inner]) => `${key}: ${formatKeyValue(inner)}`)
    .join(' · ');
}

function formatKeyValue(value: unknown): string {
  if (!isPlainObject(value)) return formatStructured(value);
  const pairs = formatStructured(value);
  return pairs ? `{ ${pairs} }` : '{}';
}

/**
 * A tool output on one line: formatted structure when the output is JSON (its
 * first line would be a bare `{` or `[`), otherwise its first non-blank line.
 */
function outputPreview(output: string): string {
  try {
    return formatStructured(JSON.parse(output));
  } catch {
    return firstLine(output);
  }
}

/** A tool input's first string argument (command, path, pattern…), or the formatted input when it has none. */
function inputPreview(input: ContentBlock['input']): string {
  const first = Object.values(input ?? {}).find((value) => typeof value === 'string');
  return typeof first === 'string' ? first : formatStructured(input ?? {});
}

function toolNode(key: string, block: ContentBlock, toolResults: Map<string, ContentBlock>): TreeNode {
  const result = toolResults.get(block.id ?? '');
  const input = JSON.stringify(block.input ?? {}, null, 2);
  const output = result ? resultText(result.content) : '(no result)';
  const preview = inputPreview(block.input);
  const shortOutput = outputPreview(output);
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  return {
    key,
    label: block.name ?? 'tool',
    preview,
    outputPreview: shortOutput,
    body: input,
    tokens: inputTokens + outputTokens,
    isError: result?.is_error,
    children: [
      { key: `${key}:in`, label: 'input', preview, body: input, tokens: inputTokens },
      {
        key: `${key}:out`,
        label: 'output',
        preview: shortOutput,
        body: output,
        tokens: outputTokens,
        isError: result?.is_error,
      },
    ],
  };
}

/** One rendered line of the track, tagged with the context window it belongs to. */
export type TrackItem = { key: string; windowNumber: number } & (
  | {
      kind: 'boundary';
      /** What started the window ("context edit" or "compaction"); undefined for the first window. */
      windowType: string | undefined;
      /** The largest context any call in the window sent; undefined when no call in it succeeded. */
      contextTokens: number | undefined;
    }
  | { kind: 'day'; day: string }
  | {
      kind: 'prompt';
      exchange: Exchange;
      /** 1-based position of the prompt among the session's messages. */
      messageNumber: number | undefined;
      /** The prompt's full text; undefined when the exchange has no prompt. */
      promptText: string | undefined;
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
type Boundary = Extract<TrackItem, { kind: 'boundary' }>;

/** Tokens an assistant call sent: the whole context at that moment. 0 for a failed call. */
function contextSize(usage: Usage | undefined): number {
  if (!usage) return 0;
  return usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
}

export function buildTrackItems(
  exchanges: Exchange[],
  messages: MessageResponse[],
  toolResults: Map<string, ContentBlock>,
): TrackItem[] {
  const messageNumbers = new Map(messages.map((message, i) => [message.uuid, i + 1]));
  const messagesByUuid = new Map(messages.map((message) => [message.uuid, message]));
  let boundary: Boundary = {
    kind: 'boundary',
    key: 'window-1',
    windowNumber: 1,
    windowType: undefined,
    contextTokens: undefined,
  };
  const items: TrackItem[] = [boundary];
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
    const promptText = prompt?.type === 'user' ? messageText(prompt) : undefined;
    items.push({
      kind: 'prompt',
      key: `prompt-${exchange.index}`,
      windowNumber,
      exchange,
      messageNumber: messageNumbers.get(exchange.messageUuids[0]),
      promptText,
      promptTokens: promptText === undefined ? undefined : estimateTokens(promptText),
    });

    for (const message of exchange.messageUuids.flatMap((uuid) => messagesByUuid.get(uuid) ?? [])) {
      if (message.type === 'system' && message.data?.subtype === 'context_window' && message.content) {
        flushPending();
        windowNumber += 1;
        boundary = {
          kind: 'boundary',
          key: message.uuid,
          windowNumber,
          windowType: message.content,
          contextTokens: undefined,
        };
        items.push(boundary);
        continue;
      }
      if (message.type === 'assistant') {
        lastStopReason = message.message?.stop_reason;
        const size = contextSize(message.message?.usage);
        if (size > 0) boundary.contextTokens = Math.max(boundary.contextTokens ?? 0, size);
      }
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
