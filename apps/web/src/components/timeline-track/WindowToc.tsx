import { useEffect, useRef, useState, type RefObject } from 'react';

const FADE = '1.5rem';
const FADE_PX = 24;

/** The number of the last window line at or above the scroll area's top edge; 1 when none has scrolled past. */
function currentWindow(area: HTMLElement): number {
  const top = area.getBoundingClientRect().top + 1;
  let current = 1;
  for (const line of area.querySelectorAll<HTMLElement>('[data-window]')) {
    if (line.getBoundingClientRect().top > top) break;
    current = Number(line.dataset.window);
  }
  return current;
}

/**
 * A vertical list of context-window numbers beside the track, at most half the
 * viewport tall and vertically centered. It scrolls with the wheel; each number
 * jumps to its window. An edge fades out while more numbers lie beyond it. The
 * window the table is scrolled to is bright, and kept in view.
 */
export function WindowToc({
  count,
  collapsed,
  onJump,
  scrollArea,
}: {
  count: number;
  collapsed: Set<number>;
  onJump: (windowNumber: number) => void;
  /** The table's scroll area, whose position decides the current window. */
  scrollArea: RefObject<HTMLDivElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  const [current, setCurrent] = useState(1);
  const measure = () => {
    const list = listRef.current;
    if (!list) return;
    setMore({
      above: list.scrollTop > 0,
      below: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    });
  };
  useEffect(measure, [count]);

  // Follow the table's scroll at most once per frame; collapsing a window moves lines too.
  useEffect(() => {
    const area = scrollArea.current;
    if (!area) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setCurrent(currentWindow(area));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    area.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      area.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scrollArea, collapsed]);

  // Scroll the list just enough to keep the current number clear of the faded edges.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[current - 1] as HTMLElement | undefined;
    if (!list || !item) return;
    const top = item.offsetTop - FADE_PX;
    const bottom = item.offsetTop + item.offsetHeight + FADE_PX;
    if (top < list.scrollTop) list.scrollTop = top;
    if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [current]);

  const mask = `linear-gradient(to bottom, ${more.above ? 'transparent' : 'black'}, black ${FADE}, black calc(100% - ${FADE}), ${more.below ? 'transparent' : 'black'})`;
  const tone = (windowNumber: number) => {
    if (windowNumber === current) return 'font-semibold text-fg';
    return collapsed.has(windowNumber) ? 'text-muted-fg/40' : 'text-muted-fg';
  };
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
          aria-current={windowNumber === current || undefined}
          className={`w-full flex-none py-0.5 text-center font-mono text-[10px] hover:text-primary ${tone(windowNumber)}`}
        >
          {windowNumber}
        </button>
      ))}
    </div>
  );
}
