import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SessionTab } from '../components/SessionTabs';
import { useTimeline } from '../components/timeline-track/useTimeline';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useSettings } from '../contexts/useSettings';
import { useSessionData } from '../hooks/useSessionData';
import { useSubagentData } from '../hooks/useSubagentData';
import { usePrintMode } from '../hooks/usePrintMode';
import { useMessagePagination } from '../hooks/useMessagePagination';
import { SessionErrorState, SessionLoadingState } from './SessionStates';
import { SessionTabContent } from './SessionTabContent';

export function SessionView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings, isLoaded } = useSettings();
  const printing = usePrintMode();
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [tab, setTab] = useState<SessionTab>('timeline');
  const [selectedExchangeIndex, setSelectedExchangeIndex] = useState<number | null>(null);

  const {
    session,
    error,
    isLoading,
    mutate,
    toolResults,
    missingToolResultCount,
    displayMessages,
    insights,
    timeline,
    agentGroups,
    agentGroupFirstIds,
  } = useSessionData(id);

  const { subagentToolResults, subagentDisplayMessages } = useSubagentData(id, focusedAgentId, insights);

  const activeMessages = focusedAgentId ? subagentDisplayMessages : displayMessages;
  const activeToolResults = focusedAgentId ? subagentToolResults : toolResults;

  const handleFocusAgent = useCallback((agentId: string) => setFocusedAgentId(agentId), []);

  const timelineController = useTimeline({
    timeline,
    selectedIndex: selectedExchangeIndex,
    onSelectIndex: setSelectedExchangeIndex,
  });

  const {
    page,
    totalPages,
    visibleMessages,
    paginatedMessages,
    followMode,
    setFollowMode,
    setPage,
    onPrevPage,
    onNextPage,
    navigateToMessage,
    highlightUuid,
    messagesEndRef,
    containerRef,
    handleScroll,
    scrollToEnd,
  } = useMessagePagination({
    messages: activeMessages,
    messagesPerPage: settings.messagesPerPage,
    autoFollow: settings.autoFollow,
    isSettingsLoaded: isLoaded,
    printing,
  });
  const onBack = useCallback(() => navigate(-1), [navigate]);
  const { selectedIndex } = useKeyboardNavigation({
    itemCount: paginatedMessages.length,
    onBack,
    onPrevPage: totalPages > 1 ? onPrevPage : undefined,
    onNextPage: totalPages > 1 ? onNextPage : undefined,
    enabled: tab === 'conversation' && !isLoading && paginatedMessages.length > 0,
  });

  if (error && !session) return <SessionErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading || !session) return <SessionLoadingState />;

  const activityState = session.activityState;
  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      <div
        className="flex-1 flex flex-col border-r border-border overflow-y-auto overflow-x-hidden"
        ref={containerRef}
        onScroll={handleScroll}
      >
        <SessionTabContent
          tab={tab}
          timeline={timeline}
          controller={timelineController}
          focusedAgentId={focusedAgentId}
          onFocusAgent={handleFocusAgent}
          setTab={setTab}
          navigateToMessage={navigateToMessage}
          setSelectedExchangeIndex={setSelectedExchangeIndex}
          displayMessages={displayMessages}
          toolResults={toolResults}
          agentGroups={agentGroups}
          agentGroupFirstIds={agentGroupFirstIds}
          visibleMessages={visibleMessages}
          activeToolResults={activeToolResults}
          activityState={activityState}
          selectedIndex={selectedIndex}
          printing={printing}
          highlightUuid={highlightUuid}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          scrollToEnd={scrollToEnd}
          followMode={followMode}
          setFollowMode={setFollowMode}
          missingToolResultCount={missingToolResultCount}
          skippedLines={session.skippedLines}
          messagesEndRef={messagesEndRef}
        />
      </div>
    </div>
  );
}
