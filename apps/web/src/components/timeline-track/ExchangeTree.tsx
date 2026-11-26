import { memo, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { TextSegment } from '../MessageContent';
import type { Segment, TreeNode } from './trackItems';
import { COLUMN_CLASS, ROW_LAYOUT } from './columns';
import { formatTokenCount } from '../../utils';

/** A context window's boundary line; clicking it collapses or expands the window's rows. */
export const WindowDivider = memo(function WindowDivider({
  windowNumber,
  contextTokens,
  windowType,
  collapsed,
  onToggle,
}: {
  windowNumber: number;
  contextTokens: number | undefined;
  windowType: string | undefined;
  collapsed: boolean;
  onToggle: (windowNumber: number) => void;
}) {
  const size = contextTokens === undefined ? undefined : formatTokenCount(contextTokens);
  const label = [`Context window ${windowNumber}`, size, windowType].filter(Boolean).join(' · ');
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
        <span className={`${COLUMN_CLASS.tokens} ml-auto font-mono text-[10px] text-muted-fg`}>
          {formatTokenCount(node.tokens)}
        </span>
      </button>
      {expansion}
    </>
  );
}

/**
 * A top-level row for one assistant text message. Open, the one-line row stays
 * pinned while the full text and the tool calls below it scroll past.
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
  // Selecting text must not close the row.
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
        <div className={`${COLUMN_CLASS.prompt} truncate font-mono text-[11.5px] text-muted-fg`}>
          {segment.text === undefined ? (
            <span className="italic">(no text reply)</span>
          ) : (
            <InlineMarkdown text={segment.text} />
          )}
        </div>
        <span className={`${COLUMN_CLASS.elapsed} font-mono text-[10px] text-muted-fg`}>
          {toolCount === 0 ? '' : `${toolCount} tool${toolCount === 1 ? '' : 's'}`}
        </span>
        <span className={`${COLUMN_CLASS.tokens} font-mono text-[10px] text-muted-fg`}>
          {formatTokenCount(segment.tokens)}
        </span>
      </div>
      {open && segment.text !== undefined && (
        <div className={`${ROW_LAYOUT} border-b border-border/30 py-2`}>
          <span className={COLUMN_CLASS.number} />
          <div className={COLUMN_CLASS.prompt}>
            <TextSegment content={segment.text} variant="assistant" />
          </div>
          <span className={COLUMN_CLASS.elapsed} />
          <span className={COLUMN_CLASS.tokens} />
        </div>
      )}
      {open && segment.nodes.map((node) => <TreeRow key={node.key} node={node} depth={0} />)}
    </div>
  );
});
