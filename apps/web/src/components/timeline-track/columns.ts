/**
 * Column layout for the Timeline Track table: # · Prompt (flex) · Elapsed · Tokens.
 * Header and rows import these so the columns always line up.
 */

/** Width/flex class per column, keyed by the header label it sits under. */
export const COLUMN_CLASS = {
  number: 'w-[36px] flex-none',
  prompt: 'flex-1 min-w-0',
  elapsed: 'w-[56px] flex-none text-right whitespace-nowrap',
  tokens: 'w-[88px] flex-none text-right',
} as const;

/** Shared horizontal layout (flex, gap, padding) for the header and every row. */
export const ROW_LAYOUT = 'flex items-center gap-5 px-8';
