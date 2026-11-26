import { COLUMN_CLASS, ROW_LAYOUT } from './columns';

/**
 * Sticky column header for the Timeline Track. Labels and widths match the
 * exchange rows below via the shared {@link COLUMN_CLASS} map.
 */
export function TrackColumnHeader() {
  return (
    <div
      className={`${ROW_LAYOUT} flex-none border-b border-border py-2.5 text-[11px] text-muted-fg`}
    >
      <span className={COLUMN_CLASS.number}>#</span>
      <span className={COLUMN_CLASS.prompt}>Prompt</span>
      <span className={COLUMN_CLASS.elapsed}>Elapsed</span>
      <span className={COLUMN_CLASS.tokens}>Tokens</span>
    </div>
  );
}
