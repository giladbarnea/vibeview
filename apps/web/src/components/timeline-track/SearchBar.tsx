import { useEffect, useRef } from 'react';

/**
 * The find bar opened by Cmd/Ctrl+F: a query input and a match counter.
 * Enter jumps to the next match, Shift+Enter to the previous one, Esc closes it.
 */
export function SearchBar({
  value,
  onChange,
  position,
  total,
  onStep,
  onClose,
  focusSignal,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Index of the current match, or -1 when there is none. */
  position: number;
  total: number;
  onStep: (delta: number) => void;
  onClose: () => void;
  /** Changes each time Cmd/Ctrl+F is pressed, to refocus and select the query. */
  focusSignal: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const counter = total === 0 ? (value ? 'No matches' : '') : `${position + 1}/${total}`;
  return (
    <div
      className="absolute top-12 right-10 z-10 flex items-center gap-2 rounded-md border border-border bg-[var(--color-card)] px-2 py-1.5 shadow-lg"
      data-testid="timeline-search"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') onClose();
        }}
        placeholder="Find in session"
        className="w-64 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-muted-fg"
      />
      <span className="min-w-16 text-right font-mono text-[10px] text-muted-fg">{counter}</span>
    </div>
  );
}
