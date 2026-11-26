import { useMemo } from 'react';
import useSWRImmutable from 'swr/immutable';
import { fetcher } from '../api';
import type { SessionDetail, ContentBlock, MessageResponse } from '../types';
import { isHiddenMessage } from '../lib/messageVisibility';

export function buildToolResultMap(messages: MessageResponse[]): Map<string, ContentBlock> {
  const map = new Map<string, ContentBlock>();
  for (const msg of messages) {
    if (msg.type !== 'user' || !msg.message) continue;
    const content = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        map.set(block.tool_use_id, block);
      }
    }
  }
  return map;
}

/**
 * The session as one snapshot per browser document. It is fetched on the first
 * view and reused for every later view of the same session: focus, reconnect and
 * remounting never refetch, and nothing is streamed in. A full page reload starts
 * a new document and reads the session file again.
 */
export function useSessionData(id: string | undefined) {
  const {
    data: session,
    error,
    isLoading,
    mutate,
  } = useSWRImmutable<SessionDetail>(id ? `/api/sessions/${id}` : null, fetcher);

  const allMessages = useMemo(() => session?.messages ?? [], [session]);

  const { toolResults, missingToolResultCount } = useMemo(() => {
    const results = buildToolResultMap(allMessages);
    // Count tool_use blocks that reference a missing tool_result
    let missing = 0;
    for (const msg of allMessages) {
      if (msg.type !== 'assistant' || !msg.message) continue;
      const content = msg.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === 'tool_use' && block.id && !results.has(block.id)) {
          missing++;
        }
      }
    }
    return { toolResults: results, missingToolResultCount: missing };
  }, [allMessages]);

  // Use API-provided insights when available.
  const insights = session?.insights ?? null;

  // Server-computed Timeline Track payload (exchanges + session insights).
  const timeline = session?.timeline ?? null;

  // Keep agentGroups/agentGroupFirstIds for AgentProgressWidget (old-format rendering).
  const { agentGroups, agentGroupFirstIds } = useMemo(() => {
    const groups = new Map<string, MessageResponse[]>();
    const firstIds = new Set<string>();
    // Build groups from progress messages for the AgentProgressWidget.
    for (const msg of allMessages) {
      if (msg.type !== 'progress' || msg.data?.type !== 'agent_progress') continue;
      const agentId = String(msg.data.agentId ?? '');
      if (!agentId) continue;
      const existing = groups.get(agentId);
      if (existing) {
        existing.push(msg);
      } else {
        groups.set(agentId, [msg]);
        firstIds.add(msg.uuid);
      }
    }
    return { agentGroups: groups, agentGroupFirstIds: firstIds };
  }, [allMessages]);

  // Filter out non-renderable messages for pagination.
  const displayMessages = useMemo(() => {
    return allMessages.filter((m) => !isHiddenMessage(m));
  }, [allMessages]);

  return {
    session,
    error,
    isLoading,
    mutate,
    allMessages,
    toolResults,
    missingToolResultCount,
    displayMessages,
    insights,
    timeline,
    agentGroups,
    agentGroupFirstIds,
  };
}
