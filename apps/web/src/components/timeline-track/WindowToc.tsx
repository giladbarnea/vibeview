import { useEffect, useRef, useState } from 'react';

const FADE = '1.5rem';

/**
 * A vertical list of context-window numbers beside the track, at most half the
 * viewport tall and vertically centered. It scrolls with the wheel; each number
 * jumps to its window. An edge fades out while more numbers lie beyond it.
 */
export function WindowToc({
  count,
  collapsed,
  onJump,
}: {
  count: number;
  collapsed: Set<number>;
  onJump: (windowNumber: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  const measure = () => {
    const list = listRef.current;
    if (!list) return;
    setMore({
      above: list.scrollTop > 0,
      below: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    });
  };
  useEffect(measure, [count]);

  const mask = `linear-gradient(to bottom, ${more.above ? 'transparent' : 'black'}, black ${FADE}, black calc(100% - ${FADE}), ${more.below ? 'transparent' : 'black'})`;
  return (
    <div
      ref={listRef}
      onScroll={measure}
      className="absolute top-1/2 left-full flex max-h-[50vh] w-8 -translate-y-1/2 flex-col overflow-y-auto py-1 [scrollbar-width:none]"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      data-testid="window-toc"
    >
      {Array.from({ length: count }, (_, i) => i + 1).map((windowNumber) => (
        <button
          key={windowNumber}
          type="button"
          onClick={() => onJump(windowNumber)}
          className={`w-full flex-none py-0.5 text-center font-mono text-[10px] hover:text-primary ${collapsed.has(windowNumber) ? 'text-muted-fg/40' : 'text-muted-fg'}`}
        >
          {windowNumber}
        </button>
      ))}
    </div>
  );
}
