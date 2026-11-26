import { memo, useEffect, useRef } from 'react';
import { TextSegment } from '../MessageContent';
import type { Exchange } from '../../types';
import { formatDurationMs, formatTokenCount } from '../../utils';
import { COLUMN_CLASS, ROW_LAYOUT } from './columns';

export type Density = 'compact' | 'comfortable';

interface TrackRowProps {
  /** The row's key in the set of open rows. */
  rowKey: string;
  exchange: Exchange;
  /** 1-based position of the prompt message among the session's messages. */
  messageNumber: number | undefined;
  selected: boolean;
  onSelect: (index: number) => void;
  open: boolean;
  onToggle: (key: string) => void;
  /** The prompt's full text, shown as markdown when the row is open. */
  promptText: string | undefined;
  /** Estimated tokens of the prompt's own text; undefined when the exchange has no prompt. */
  promptTokens: number | undefined;
  density: Density;
}

/** Second line of the Prompt column: skill chips, the first command, and a `+N more`. */
function PromptSubline({ skills, commands }: { skills: string[]; commands: string[] }) {
  const moreCommands = commands.length - 1;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {skills.map((skill) => (
        <span
          key={skill}
          className="flex flex-none items-center gap-[3px] rounded-[3px] border border-tertiary-container-fg/20 bg-tertiary-container px-[5px] font-mono text-[10px] text-tertiary-container-fg"
        >
          <span className="material-symbols-outlined text-[11px]">magic_button</span>/{skill}
        </span>
      ))}
      {commands[0] && (
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-fg">{commands[0]}</span>
      )}
      {moreCommands > 0 && (
        <span className="flex-none font-mono text-[10px] text-muted-fg/70">
          +{moreCommands} more
        </span>
      )}
    </div>
  );
}

/**
 * One exchange's prompt as a clickable row: message number, the prompt
 * (+ optional skill/command subline), elapsed time, and the prompt's own
 * estimated token count. A faint band sets prompts apart from the assistant's rows.
 * Clicking selects it and opens its full text as markdown.
 */
export const TrackRow = memo(function TrackRow({
  rowKey,
  exchange,
  messageNumber,
  selected,
  onSelect,
  open,
  onToggle,
  promptText,
  promptTokens,
  density,
}: TrackRowProps) {
  const { durationMs, promptPreview, promptSource, skills, commands } = exchange;
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const hasSubline = skills.length > 0 || commands.length > 0;
  // Selecting text in an open prompt must not close it.
  const selectAndToggle = () => {
    if (window.getSelection()?.toString()) return;
    onSelect(exchange.index);
    onToggle(rowKey);
  };

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={selectAndToggle}
      aria-current={selected || undefined}
      style={selected ? { boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}
      className={`${ROW_LAYOUT} w-full cursor-pointer border-b border-border/60 text-left hover:bg-primary/5 ${
        density === 'compact' ? 'py-2' : 'py-3'
      } ${selected ? 'bg-primary/10' : 'bg-secondary/50'}`}
    >
      <span className={`${COLUMN_CLASS.number} font-mono text-[10px] text-muted-fg`}>
        {messageNumber}
      </span>

      {/* Prompt */}
      <div className={`${COLUMN_CLASS.prompt} flex flex-col gap-0.5`}>
        {open && promptText !== undefined ? (
          <div>
            <TextSegment content={promptText} variant="assistant" />
          </div>
        ) : (
          <span className="line-clamp-2 font-mono text-[11.5px]" title={promptPreview}>
            {promptSource && (
              <span className="mr-2 rounded-[3px] bg-secondary px-[5px] py-px text-[10px] text-muted-fg">
                {promptSource}
              </span>
            )}
            {promptPreview || <span className="text-muted-fg">(no prompt)</span>}
          </span>
        )}
        {hasSubline && <PromptSubline skills={skills} commands={commands} />}
      </div>

      {/* Elapsed */}
      <span className={`${COLUMN_CLASS.elapsed} font-mono text-[10px] text-muted-fg`}>
        {formatDurationMs(durationMs)}
      </span>

      {/* Tokens */}
      <span className={`${COLUMN_CLASS.tokens} font-mono text-[10px] text-muted-fg`}>
        {promptTokens === undefined ? '' : formatTokenCount(promptTokens)}
      </span>
    </div>
  );
});
