import { memo, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { TextSegment } from '../MessageContent';
import type { ContentBlock, MessageResponse } from '../../types';
import { COLUMN_CLASS, ROW_LAYOUT } from './columns';
import { estimateTokens } from './tokens';
import { formatTokenCount } from '../../utils';

interface TreeNode {
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

/** Where a new context window begins: a system message whose content is the window's label. */
interface WindowBoundary {
  key: string;
  windowLabel: string;
}

export type ExchangeItem = Segment | WindowBoundary;

export function isSegment(item: ExchangeItem): item is Segment {
  return !('windowLabel' in item);
}

/**
 * Splits an exchange's messages into segments, each closed by an assistant text
 * block, and context-window boundaries. Tool calls pending at a boundary close
 * into a segment without text, since they belong to the earlier window.
 */
export function exchangeItems(
  messages: MessageResponse[],
  toolResults: Map<string, ContentBlock>,
): ExchangeItem[] {
  const items: ExchangeItem[] = [];
  let pending: TreeNode[] = [];
  let pendingThinkingTokens = 0;
  let pendingUuid = '';
  const flushPending = () => {
    if (pending.length === 0) return;
    items.push({
      key: `${pending[0].key}:trailing`,
      messageUuid: pendingUuid,
      nodes: pending,
      tokens: pendingThinkingTokens + sumTokens(pending),
    });
    pending = [];
    pendingThinkingTokens = 0;
  };
  for (const message of messages) {
    if (message.type === 'system' && message.content) {
      flushPending();
      items.push({ key: message.uuid, windowLabel: message.content });
      continue;
    }
    const content = message.message?.content ?? [];
    const blocks: ContentBlock[] =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content;
    blocks.forEach((block, i) => {
      const key = `${message.uuid}:${i}`;
      const text = block.text ?? '';
      if (block.type === 'text' && message.type === 'assistant' && text.trim()) {
        items.push({
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
  flushPending();
  return items;
}

function sumTokens(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + node.tokens, 0);
}

/** A context window's boundary line; clicking it collapses or expands the window's rows. */
export const WindowDivider = memo(function WindowDivider({
  windowNumber,
  label,
  collapsed,
  onToggle,
}: {
  windowNumber: number;
  label: string;
  collapsed: boolean;
  onToggle: (windowNumber: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(windowNumber)}
      data-window={windowNumber}
      className="flex w-full items-center gap-3 px-8 py-2.5 text-primary hover:bg-primary/5"
      data-testid="window-divider"
    >
      <div className="h-px flex-1 bg-primary/60" />
      <span className="flex items-center gap-1 font-mono text-[11px]">
        <span className="material-symbols-outlined text-[14px]">{collapsed ? 'chevron_right' : 'expand_more'}</span>
        {label}
      </span>
      <div className="h-px flex-1 bg-primary/60" />
    </button>
  );
});

/** One-line markdown preview: inline formatting only, so it truncates on a single line. */
const INLINE_ELEMENTS = ['strong', 'em', 'code', 'del'];
const INLINE_COMPONENTS: Components = {
  code: ({ children }) => <code className="rounded bg-secondary px-1">{children}</code>,
};

const InlineMarkdown = memo(function InlineMarkdown({ text }: { text: string }) {
  return (
    <Markdown allowedElements={INLINE_ELEMENTS} unwrapDisallowed components={INLINE_COMPONENTS}>
      {text}
    </Markdown>
  );
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      className="material-symbols-outlined absolute top-1.5 right-1.5 rounded bg-card px-1 text-[14px] text-muted-fg hover:text-fg"
    >
      {copied ? 'check' : 'content_copy'}
    </button>
  );
}

const EMPTY_INPUTS = new Set(['', '{}', '[]']);

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * `input -> output` on one line. Each side truncates with an ellipsis; the two
 * share the width equally, and a side that fits whole gives the rest to the
 * other (grid tracks grow equally up to their content width). An empty input
 * is skipped, leaving ` -> output`.
 */
function InputOutputPreview({ input, output }: { input: string; output: string }) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,max-content)_max-content_minmax(0,max-content)] font-mono text-[11px] text-muted-fg">
      <span className="truncate">{EMPTY_INPUTS.has(input.trim()) ? '' : flatten(input)}</span>
      <span className="whitespace-pre">{' -> '}</span>
      <span className="truncate">{flatten(output)}</span>
    </span>
  );
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(false);
  let expansion: ReactNode = null;
  if (open && node.children)
    expansion = node.children.map((child) => (
      <TreeRow key={child.key} node={child} depth={depth + 1} />
    ));
  else if (open)
    expansion = (
      <div className="relative mb-1" style={{ marginLeft: depth * 20 + 52 }}>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded bg-surface-dim/60 px-3 py-2 pr-8 font-mono text-[11px]">
          {node.body}
        </pre>
        <CopyButton text={node.body} />
      </div>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border/30 bg-surface-dim/30 py-1 pr-8 text-left hover:bg-primary/5"
        style={{ paddingLeft: depth * 20 + 32 }}
      >
        <span className="material-symbols-outlined flex-none text-[14px] text-muted-fg">
          {open ? 'expand_more' : 'chevron_right'}
        </span>
        <span className={`flex-none font-mono text-[11px] ${node.isError ? 'text-destructive' : ''}`}>
          {node.label}
        </span>
        {node.outputPreview === undefined ? (
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-fg">{flatten(node.preview)}</span>
        ) : (
          <InputOutputPreview input={node.preview} output={node.outputPreview} />
        )}
        <span className={`${COLUMN_CLASS.tokens} ml-auto text-right font-mono text-[10px] text-muted-fg`}>
          {formatTokenCount(node.tokens)}
        </span>
      </button>
      {expansion}
    </>
  );
}

/**
 * A top-level row for one assistant text message. Open, it shows the full text,
 * stays pinned while its tool calls scroll past, and lists those calls below.
 */
/** Memoized: re-renders only when its props change, so a selection or toggle repaints just the affected rows. */
export const AssistantRow = memo(function AssistantRow({
  segment,
  messageNumber,
  open,
  onToggle,
}: {
  segment: Segment;
  messageNumber: number | undefined;
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const toolCount = segment.nodes.length;
  // Selecting text in an open message must not close it.
  const toggleUnlessSelecting = () => {
    if (window.getSelection()?.toString()) return;
    onToggle(segment.key);
  };
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={toggleUnlessSelecting}
        className={`${ROW_LAYOUT} w-full cursor-pointer border-b border-border/60 py-2 text-left hover:bg-primary/5 ${open ? 'sticky top-0 z-[1] bg-[var(--color-card)]' : ''}`}
      >
        <span className={`${COLUMN_CLASS.number} font-mono text-[10px] text-muted-fg`}>
          {messageNumber}
        </span>
        <span className={`${COLUMN_CLASS.elapsed} text-right font-mono text-[10px] text-muted-fg`}>
          {toolCount === 0 ? '' : `${toolCount} tool${toolCount === 1 ? '' : 's'}`}
        </span>
        <div
          className={`${COLUMN_CLASS.prompt} ${open ? 'max-h-[30vh] overflow-y-auto' : 'truncate font-mono text-[11.5px] text-muted-fg'}`}
        >
          {segment.text === undefined && <span className="italic">(no text reply)</span>}
          {segment.text !== undefined &&
            (open ? <TextSegment content={segment.text} variant="assistant" /> : <InlineMarkdown text={segment.text} />)}
        </div>
        <span className={`${COLUMN_CLASS.tokens} text-right font-mono text-[10px] text-muted-fg`}>
          {formatTokenCount(segment.tokens)}
        </span>
      </div>
      {open && segment.nodes.map((node) => <TreeRow key={node.key} node={node} depth={0} />)}
    </div>
  );
});
