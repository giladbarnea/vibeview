import { useCallback, useState } from 'react';
import type { Exchange, TimelineResponse } from '../../types';
import { exchangeItems, isSegment } from './ExchangeTree';
import { resolveExchangeMessages } from './exchangeData';
import { TimelineTrack } from './TimelineTrack';
import { useTimelineKeyboard } from './useTimelineKeyboard';
import type { TimelineController } from './useTimeline';
import type { SessionMessageContext } from './exchangeData';
import type { Density } from './TrackRow';

interface TimelineTabProps {
  timeline: TimelineResponse | null;
  /** The shared timeline state and actions; owned by the parent (see {@link useTimeline}). */
  controller: TimelineController;
  /** Clears the selection, closing the detail panel. */
  onClose?: () => void;
  /** Switch to the Conversation tab, jumping to the given exchange (best-effort). */
  onOpenInConversation?: (exchange: Exchange) => void;
  /**
   * Session messages + maps used to build the assistant rows under each prompt.
   */
  messageContext?: SessionMessageContext;
  density?: Density;
}

/**
 * The Timeline tab: composes the toolbar, the overview strip, the track, and the
 * detail panel, plus the scoped keyboard navigation. All timeline state (query,
 * filters, selection, visible exchanges) lives in the shared
 * {@link TimelineController} so the sidebar's insights can drive the same track.
 */
export function TimelineTab({
  timeline,
  controller,
  messageContext,
  density,
}: TimelineTabProps) {
  const {
    allExchanges,
    visible,
    clearSearch,
    reset,
    showIdleGaps,
    selectedIndex,
    onSelectIndex,
  } = controller;

  const [openSegments, setOpenSegments] = useState<Set<string>>(new Set());
  const toggleSegment = useCallback(
    (key: string) =>
      setOpenSegments((previous) => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );
  const setExchangeOpen = (index: number, open: boolean) => {
    const exchange = allExchanges.find((e) => e.index === index);
    if (!exchange || !messageContext) return;
    const exchangeMessages = resolveExchangeMessages({ exchange, messages: messageContext.messages });
    const keys = exchangeItems(exchangeMessages, messageContext.toolResults)
      .filter(isSegment)
      .map((segment) => segment.key);
    setOpenSegments((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (open) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  useTimelineKeyboard({
    enabled: allExchanges.length > 0,
    visibleExchanges: visible,
    selectedIndex,
    onSelectIndex,
    onOpen: (index) => setExchangeOpen(index, true),
    onClose: (index) => setExchangeOpen(index, false),
    onClearSearch: clearSearch,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <TimelineTrack
          timeline={timeline}
          visibleExchanges={visible}
          showIdleGaps={showIdleGaps}
          selectedIndex={selectedIndex}
          onSelectIndex={onSelectIndex}
          density={density}
          onReset={reset}
          messageContext={messageContext}
          openSegments={openSegments}
          onToggleSegment={toggleSegment}
        />
      </div>
    </div>
  );
}
