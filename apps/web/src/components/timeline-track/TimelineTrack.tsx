import { useCallback, useMemo, useRef, useState } from 'react';
import type { Exchange, TimelineResponse } from '../../types';
import { TrackColumnHeader } from './TrackColumnHeader';
import { TrackRow, type Density } from './TrackRow';
import { IdleDivider } from './IdleDivider';
import { TrackEmptyState } from './TrackEmptyState';
import { IDLE_DIVIDER_MIN_MS, formatDay } from './format';
import { DateDivider } from './DateDivider';
import { estimateTokens, messageText } from './tokens';
import { AssistantRow, WindowDivider, exchangeItems, isSegment, type Segment } from './ExchangeTree';
import { WindowToc } from './WindowToc';
import type { SessionMessageContext } from './exchangeData';

interface TimelineTrackProps {
  /** The session's full timeline. */
  timeline: TimelineResponse | null;
  /** The exchanges to render. Defaults to the full set when omitted. */
  visibleExchanges?: Exchange[];
  /** Hide idle dividers while a filter or search is active (they only aid the full view). */
  showIdleGaps?: boolean;
  /** Index of the selected exchange, or null when none is selected. */
  selectedIndex: number | null;
  /** Called with an exchange index when its row is clicked. */
  onSelectIndex: (index: number) => void;
  density?: Density;
  /** Clears filters/search from the empty state. */
  onReset?: () => void;
  /** Session messages used to render the assistant rows under each prompt. */
  messageContext?: SessionMessageContext;
  /** Keys of the assistant rows that are open. */
  openSegments: Set<string>;
  onToggleSegment: (key: string) => void;
}

/** One rendered line of the track, tagged with the context window it belongs to. */
type TrackItem = { key: string; windowNumber: number } & (
  | { kind: 'boundary'; label: string }
  | { kind: 'idle'; idleMs: number }
  | { kind: 'day'; day: string }
  | { kind: 'prompt'; exchange: Exchange }
  | { kind: 'segment'; segment: Segment }
);

/**
 * The Timeline Track: one flat list of prompt rows, assistant rows, day and idle
 * dividers, and context-window boundaries under a sticky column header. Each
 * boundary collapses its window; the window list beside the track jumps to one.
 */
export function TimelineTrack({
  timeline,
  visibleExchanges,
  showIdleGaps = true,
  selectedIndex,
  onSelectIndex,
  density = 'comfortable',
  onReset,
  messageContext,
  openSegments,
  onToggleSegment,
}: TimelineTrackProps) {
  const messages = messageContext?.messages;
  const toolResults = messageContext?.toolResults;
  const messageNumbers = useMemo(
    () => new Map((messages ?? []).map((message, i) => [message.uuid, i + 1])),
    [messages],
  );
  const messagesByUuid = useMemo(
    () => new Map((messages ?? []).map((message) => [message.uuid, message])),
    [messages],
  );
  const promptTokens = (exchange: Exchange) => {
    const prompt = messagesByUuid.get(exchange.messageUuids[0]);
    return prompt?.type === 'user' ? estimateTokens(messageText(prompt)) : undefined;
  };
  const rows = visibleExchanges ?? timeline?.exchanges ?? [];

  const items = useMemo(() => {
    const result: TrackItem[] = [
      { kind: 'boundary', key: 'window-1', windowNumber: 1, label: 'Context window 1 · session start' },
    ];
    let windowNumber = 1;
    rows.forEach((exchange, position) => {
      if (showIdleGaps && exchange.idleBeforeMs >= IDLE_DIVIDER_MIN_MS)
        result.push({ kind: 'idle', key: `idle-${exchange.index}`, windowNumber, idleMs: exchange.idleBeforeMs });
      const day = formatDay(exchange.startTime);
      if (day !== formatDay(rows[position - 1]?.startTime ?? ''))
        result.push({ kind: 'day', key: `day-${exchange.index}`, windowNumber, day });
      result.push({ kind: 'prompt', key: `prompt-${exchange.index}`, windowNumber, exchange });
      const exchangeMessages = exchange.messageUuids.flatMap((uuid) => messagesByUuid.get(uuid) ?? []);
      for (const item of exchangeItems(exchangeMessages, toolResults ?? new Map())) {
        if (isSegment(item)) {
          result.push({ kind: 'segment', key: item.key, windowNumber, segment: item });
          continue;
        }
        windowNumber += 1;
        result.push({ kind: 'boundary', key: item.key, windowNumber, label: item.windowLabel });
      }
    });
    return result;
  }, [rows, showIdleGaps, messagesByUuid, toolResults]);
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
            label={item.label}
            collapsed={collapsedWindows.has(item.windowNumber)}
            onToggle={toggleWindow}
          />
        );
      case 'idle':
        return <IdleDivider key={item.key} idleMs={item.idleMs} />;
      case 'day':
        return <DateDivider key={item.key} day={item.day} />;
      case 'prompt':
        return (
          <TrackRow
            key={item.key}
            exchange={item.exchange}
            messageNumber={messageNumbers.get(item.exchange.messageUuids[0])}
            selected={selectedIndex === item.exchange.index}
            onSelect={onSelectIndex}
            promptTokens={promptTokens(item.exchange)}
            density={density}
          />
        );
      case 'segment':
        return (
          <AssistantRow
            key={item.key}
            segment={item.segment}
            messageNumber={messageNumbers.get(item.segment.messageUuid)}
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
        {rows.length === 0 ? <TrackEmptyState onReset={onReset} /> : shown.map(renderItem)}
      </div>
      <WindowToc count={windowCount} collapsed={collapsedWindows} onJump={jumpToWindow} />
    </div>
  );
}
