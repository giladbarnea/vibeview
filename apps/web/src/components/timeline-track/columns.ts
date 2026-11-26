/**
 * Column layout for the Timeline Track table. Header and rows import these so
 * the seven columns always line up. Widths mirror the designer's mock
 * (Timeline Track.dc.html): Time 46 · Elapsed 128 · Prompt flex · Tools 196 ·
 * Files 156 · Tokens 88 · Flags 54.
 */

/** Width/flex class per column, keyed by the header label it sits under. */
export const COLUMN_CLASS = {
  number: 'w-[44px] flex-none text-right',
  elapsed: 'w-[50px] flex-none',
  prompt: 'flex-1 min-w-0',
  tokens: 'w-[88px] flex-none',
} as const;

/** Shared horizontal layout (flex, gap, padding) for the header and every row. */
export const ROW_LAYOUT = 'flex items-center gap-5 px-8';
