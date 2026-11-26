import { memo, useEffect, useRef } from 'react';
import type { Exchange } from '../../types';
import { formatDurationMs, formatTokenCount } from '../../utils';
import { COLUMN_CLASS, ROW_LAYOUT } from './columns';

export type Density = 'compact' | 'comfortable';

interface TrackRowProps {
  exchange: Exchange;
  /** 1-based position of the prompt message among the session's messages. */
  messageNumber: number | undefined;
  selected: boolean;
  onSelect: (index: number) => void;
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
 * One exchange's prompt as a clickable row: message number, elapsed time,
 * the right-aligned prompt (+ optional skill/command subline), and the prompt's
 * own estimated token count.
 */
export const TrackRow = memo(function TrackRow({
  exchange,
  messageNumber,
  selected,
  onSelect,
  promptTokens,
  density,
}: TrackRowProps) {
  const { durationMs, promptPreview, promptSource, skills, commands } = exchange;
  const rowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const hasSubline = skills.length > 0 || commands.length > 0;

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={() => onSelect(exchange.index)}
      aria-current={selected || undefined}
      style={selected ? { boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}
      className={`${ROW_LAYOUT} w-full border-b border-border/60 text-left hover:bg-primary/5 ${
        density === 'compact' ? 'py-2' : 'py-3'
      } ${selected ? 'bg-primary/10' : ''}`}
    >
      <span className={`${COLUMN_CLASS.number} font-mono text-[10px] text-muted-fg`}>
        {messageNumber}
      </span>

      {/* Elapsed */}
      <span className={`${COLUMN_CLASS.elapsed} text-right font-mono text-[10px] whitespace-nowrap text-muted-fg`}>
        {formatDurationMs(durationMs)}
      </span>

      {/* Prompt */}
      <div className={`${COLUMN_CLASS.prompt} flex flex-col items-end gap-0.5`}>
        <span className="line-clamp-2 text-right font-mono text-[11.5px]" title={promptPreview}>
          {promptSource && (
            <span className="mr-2 rounded-[3px] bg-secondary px-[5px] py-px text-[10px] text-muted-fg">
              {promptSource}
            </span>
          )}
          {promptPreview || <span className="text-muted-fg">(no prompt)</span>}
        </span>
        {hasSubline && <PromptSubline skills={skills} commands={commands} />}
      </div>

      {/* Tokens */}
      <span className={`${COLUMN_CLASS.tokens} text-right font-mono text-[10px] text-muted-fg`}>
        {promptTokens === undefined ? '' : formatTokenCount(promptTokens)}
      </span>
    </button>
  );
});
