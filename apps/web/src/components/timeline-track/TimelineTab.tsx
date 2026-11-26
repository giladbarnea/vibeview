import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Exchange, TimelineResponse } from '../../types';
import { buildTrackItems } from './trackItems';
import { NO_MATCHES, buildSearchIndex, findMatches } from './search';
import { SearchBar } from './SearchBar';
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
  controller,
  messageContext,
  density,
}: TimelineTabProps) {
  const {
    allExchanges,
    visible,
    clearSearch,
    reset,
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
  const messages = messageContext?.messages;
  const toolResults = messageContext?.toolResults;
  const items = useMemo(
    () => buildTrackItems(visible, messages ?? [], toolResults ?? new Map()),
    [visible, messages, toolResults],
  );
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

  // Find: Cmd/Ctrl+F opens the bar; the query applies 150ms after typing stops.
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [matchPosition, setMatchPosition] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput);
      setMatchPosition(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [queryInput]);
  useEffect(() => {
    const openOnFind = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'f') return;
      event.preventDefault();
      setSearchOpen(true);
      setFocusSignal((signal) => signal + 1);
    };
    window.addEventListener('keydown', openOnFind);
    return () => window.removeEventListener('keydown', openOnFind);
  }, []);
  const closeSearch = () => {
    setSearchOpen(false);
    setQueryInput('');
  };
  const searchIndex = useMemo(() => buildSearchIndex(items), [items]);
  const matches = useMemo(() => (query ? findMatches(searchIndex, query) : NO_MATCHES), [searchIndex, query]);
  const currentMatchKey = matches.rowKeys[matchPosition];
  const stepMatch = (delta: number) =>
    setMatchPosition((position) => (position + delta + matches.rowKeys.length) % matches.rowKeys.length);

  // Reveal the current match: expand its window and scroll it to the middle. A
  // prompt is selected, not opened, so after Esc the arrow keys and Enter act on
  // it; an assistant row opens to show its matching tool calls.
  useEffect(() => {
    if (currentMatchKey === undefined) return;
    const item = items.find((candidate) => candidate.key === currentMatchKey);
    if (!item) return;
    setCollapsedWindows((previous) => {
      const next = new Set(previous);
      next.delete(item.windowNumber);
      return next;
    });
    if (item.kind === 'prompt') onSelectIndex(item.exchange.index);
    else setOpenSegments((previous) => new Set(previous).add(currentMatchKey));
    requestAnimationFrame(() =>
      document.querySelector(`[data-row-key="${currentMatchKey}"]`)?.scrollIntoView({ block: 'center' }),
    );
  }, [currentMatchKey, items, onSelectIndex]);

  /** Opens or closes a prompt row together with the assistant rows up to the next prompt. */
  const setExchangeOpen = (index: number, open: boolean) => {
    const start = items.findIndex((item) => item.kind === 'prompt' && item.exchange.index === index);
    const keys: string[] = [items[start].key];
    for (const item of items.slice(start + 1)) {
      if (item.kind === 'prompt') break;
      if (item.kind === 'segment') keys.push(item.key);
    }
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      {searchOpen && (
        <SearchBar
          value={queryInput}
          onChange={setQueryInput}
          position={matches.rowKeys.length === 0 ? -1 : matchPosition}
          total={matches.rowKeys.length}
          onStep={stepMatch}
          onClose={closeSearch}
          focusSignal={focusSignal}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <TimelineTrack
          items={items}
          empty={visible.length === 0}
          selectedIndex={selectedIndex}
          onSelectIndex={onSelectIndex}
          density={density}
          onReset={reset}
          openSegments={openSegments}
          onToggleSegment={toggleSegment}
          collapsedWindows={collapsedWindows}
          onToggleWindow={toggleWindow}
          matches={matches}
          currentMatchKey={currentMatchKey}
        />
      </div>
    </div>
  );
}
