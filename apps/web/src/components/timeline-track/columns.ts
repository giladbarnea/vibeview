/**
 * Column layout for the Timeline Track table: # · Prompt (flex) · Elapsed · Tokens.
 * Header and rows import these so the columns always line up.
 */

/** Width/flex class per column, keyed by the header label it sits under. */
export const COLUMN_CLASS = {
  number: 'w-[36px] flex-none',
  prompt: 'flex-1 min-w-0',
  elapsed: 'w-[54px] flex-none text-right whitespace-nowrap',
  tokens: 'w-[40px] flex-none text-right whitespace-nowrap',
} as const;

/** Shared horizontal layout (flex, gap, padding) for the header and every row. */
export const ROW_LAYOUT = 'flex items-center gap-5 px-8';

/** Left edge of the Prompt column within a row, in px: row padding 32 + # column 36 + gap 20. */
export const PROMPT_COLUMN_LEFT = 88;

/** How far each tree level (assistant row, tool call, input/output) indents past its parent, in px. */
export const TREE_INDENT = 24;

/**
 * Left edge of a tool row's label at `depth` (0 = a tool call, 1 = its
 * input/output); a tool call starts where its assistant row's text does, and
 * opened content lines up with the label.
 */
export function toolRowIndent(depth: number): number {
  return PROMPT_COLUMN_LEFT + TREE_INDENT * (depth + 1);
}
