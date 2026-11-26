import { memo } from 'react';

/** A day heading inserted above the first exchange of each calendar day. */
export const DateDivider = memo(function DateDivider({ day }: { day: string }) {
  return (
    <div
      className="border-b border-border/60 px-8 pt-5 pb-1.5 text-[12px] font-medium text-fg"
      data-testid="date-divider"
    >
      {day}
    </div>
  );
});
