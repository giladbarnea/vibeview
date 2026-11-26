import { useCallback, useRef, useState } from 'react';
import { TrackColumnHeader } from './TrackColumnHeader';
import { TrackRow, type Density } from './TrackRow';
import { TrackEmptyState } from './TrackEmptyState';
import { DateDivider } from './DateDivider';
import { AssistantRow, WindowDivider } from './ExchangeTree';
import { WindowToc } from './WindowToc';
import type { TrackItem } from './trackItems';

interface TimelineTrackProps {
  /** The track's rows, built by {@link buildTrackItems}. */
  items: TrackItem[];
  /** Whether the session has no exchanges to show. */
  empty: boolean;
  /** Index of the selected exchange, or null when none is selected. */
  selectedIndex: number | null;
  /** Called with an exchange index when its row is clicked. */
  onSelectIndex: (index: number) => void;
  density?: Density;
  /** Clears filters/search from the empty state. */
  onReset?: () => void;
  /** Keys of the prompt and assistant rows that are open. */
  openSegments: Set<string>;
  onToggleSegment: (key: string) => void;
}

/**
 * The Timeline Track: the session's rows under a sticky column header. Each
 * context-window boundary collapses its window; the window list beside the
 * track jumps to one.
 */
export function TimelineTrack({
  items,
  empty,
  selectedIndex,
  onSelectIndex,
  density = 'comfortable',
  onReset,
  openSegments,
  onToggleSegment,
}: TimelineTrackProps) {
  const windowCount = items.filter((item) => item.kind === 'boundary').length;

  const [collapsedWindows, setCollapsedWindows] = useState<Set<number>>(new Set());
  const toggleWindow = useCallback(
    (windowNumber: number) =>
      setCollapsedWindows((previous) => {
        const next = new Set(previous);
        if (!next.delete(windowNumber)) next.add(windowNumber);
        return next;
      }),
    [],
  );
  const shown = items.filter((item) => item.kind === 'boundary' || !collapsedWindows.has(item.windowNumber));

  const scrollRef = useRef<HTMLDivElement>(null);
  const jumpToWindow = (windowNumber: number) =>
    scrollRef.current
      ?.querySelector(`[data-window="${windowNumber}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  const renderItem = (item: TrackItem) => {
    switch (item.kind) {
      case 'boundary':
        return (
          <WindowDivider
            key={item.key}
            windowNumber={item.windowNumber}
            contextTokens={item.contextTokens}
            windowType={item.windowType}
            collapsed={collapsedWindows.has(item.windowNumber)}
            onToggle={toggleWindow}
          />
        );
      case 'day':
        return <DateDivider key={item.key} day={item.day} />;
      case 'prompt':
        return (
          <TrackRow
            key={item.key}
            rowKey={item.key}
            exchange={item.exchange}
            messageNumber={item.messageNumber}
            selected={selectedIndex === item.exchange.index}
            onSelect={onSelectIndex}
            open={openSegments.has(item.key)}
            onToggle={onToggleSegment}
            promptText={item.promptText}
            promptTokens={item.promptTokens}
            density={density}
          />
        );
      case 'segment':
        return (
          <AssistantRow
            key={item.key}
            segment={item.segment}
            messageNumber={item.messageNumber}
            open={openSegments.has(item.key)}
            onToggle={onToggleSegment}
          />
        );
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="timeline-track">
      <TrackColumnHeader />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {empty ? <TrackEmptyState onReset={onReset} /> : shown.map(renderItem)}
      </div>
      <WindowToc count={windowCount} collapsed={collapsedWindows} onJump={jumpToWindow} scrollArea={scrollRef} />
    </div>
  );
}
