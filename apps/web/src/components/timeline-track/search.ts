import type { TrackItem, TreeNode } from './trackItems';

/** A searchable text: a tool call's name, input or output, and the tool call it belongs to. */
interface NodeEntry {
  key: string;
  text: string;
  /** The tool call a matching input or output also marks; undefined for the tool call itself. */
  parentKey: string | undefined;
}

/** One prompt or assistant row's searchable texts, lowercased once when the session loads. */
interface SearchEntry {
  rowKey: string;
  text: string;
  nodes: NodeEntry[];
}

export interface SearchMatches {
  /** Keys of the prompt and assistant rows that match, in table order. */
  rowKeys: string[];
  /** Keys of the tool calls and inputs/outputs that match, inside those rows. */
  nodeKeys: Set<string>;
}

export const NO_MATCHES: SearchMatches = { rowKeys: [], nodeKeys: new Set() };

function nodeEntries(node: TreeNode): NodeEntry[] {
  return [
    { key: node.key, text: node.label.toLowerCase(), parentKey: undefined },
    ...(node.children ?? []).map((child) => ({
      key: child.key,
      text: child.body.toLowerCase(),
      parentKey: node.key,
    })),
  ];
}

/** The rows' texts as the table shows them in full: prompts, assistant text, tool names, inputs and outputs. */
export function buildSearchIndex(items: TrackItem[]): SearchEntry[] {
  return items.flatMap((item): SearchEntry[] => {
    if (item.kind === 'prompt')
      return [{ rowKey: item.key, text: (item.promptText ?? '').toLowerCase(), nodes: [] }];
    if (item.kind === 'segment')
      return [
        {
          rowKey: item.key,
          text: (item.segment.text ?? '').toLowerCase(),
          nodes: item.segment.nodes.flatMap(nodeEntries),
        },
      ];
    return [];
  });
}

/**
 * The rows and tool calls whose text contains `query`, case-insensitively.
 * Example: with a prompt row "Fix the Bug" and the query "bug", `rowKeys` holds
 * that row's key.
 */
export function findMatches(index: SearchEntry[], query: string): SearchMatches {
  const needle = query.toLowerCase();
  const rowKeys: string[] = [];
  const nodeKeys = new Set<string>();
  for (const entry of index) {
    let rowMatches = entry.text.includes(needle);
    for (const node of entry.nodes) {
      if (!node.text.includes(needle)) continue;
      rowMatches = true;
      nodeKeys.add(node.key);
      if (node.parentKey) nodeKeys.add(node.parentKey);
    }
    if (rowMatches) rowKeys.push(entry.rowKey);
  }
  return { rowKeys, nodeKeys };
}
