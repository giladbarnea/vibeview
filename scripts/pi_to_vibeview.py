#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# ///
"""Convert a Pi session JSONL into a Claude Code-shaped JSONL that vibeview can open.

Usage:
    uv run scripts/pi_to_vibeview.py <pi-session.jsonl> <claude-dir>/<name>.jsonl
    vibeview --claude-dir <claude-dir> web <claude-dir>/<name>.jsonl

Converts the session's active branch (last entry back to the root). Each run of
context edits or a compaction starts a new context window, written as a system
message with subtype "context_window" whose content says what started it
("context edit" or "compaction"); the Timeline draws it as a boundary.

The output file must sit inside --claude-dir: vibeview refuses paths outside it.
The source is never written: a destination that is the source file (same path,
symlink or hard link) is refused, and the output is written to a temporary file
that replaces the destination only once complete.
"""
import json, os, sys, tempfile
from pathlib import Path
source, target = Path(sys.argv[1]), Path(sys.argv[2])
if target.exists() and os.path.samefile(source, target):
    sys.exit(f"refusing to write {target}: it is the source session file itself")
entries = [json.loads(line) for line in open(source)]
header = entries[0]
by_id = {e["id"]: e for e in entries[1:] if "id" in e}
branch = []
cursor = entries[-1].get("id")
while cursor:
    branch.append(by_id[cursor])
    cursor = by_id[cursor].get("parentId")
branch.reverse()

def text_blocks(content):
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [{"type": "text", "text": c["text"]} if c["type"] == "text" else {"type": "text", "text": f"[{c['type']}]"} for c in content]

def assistant_blocks(content):
    mapping = {
        "text": lambda c: {"type": "text", "text": c["text"]},
        "thinking": lambda c: {"type": "thinking", "thinking": c.get("thinking", "")},
        "toolCall": lambda c: {"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["arguments"]},
    }
    return [mapping[c["type"]](c) for c in content if c["type"] in mapping]

out = []
previous = None
window = 1
pending_edits = 0
pending_compaction = False
# Pi's stop reason, in Claude Code's terms. tool_use means the turn continues past this call.
STOP_REASONS = {"toolUse": "tool_use", "stop": "end_turn", "length": "max_tokens", "error": "error", "aborted": "aborted"}
for entry in branch:
    if entry["type"] == "context_edit":
        pending_edits += 1
        continue
    if entry["type"] == "compaction":
        pending_compaction = True
        continue
    message = entry.get("message")
    record = {"uuid": entry["id"], "parentUuid": previous, "timestamp": entry["timestamp"],
              "sessionId": header["id"], "cwd": header["cwd"], "isSidechain": False}
    role = message and message["role"]
    if role == "user":
        record |= {"type": "user", "message": {"role": "user", "content": text_blocks(message["content"])}}
    elif role == "assistant":
        usage = message.get("usage", {})
        record |= {"type": "assistant", "message": {"role": "assistant", "model": message.get("model"),
                   "content": assistant_blocks(message["content"]), "stop_reason": STOP_REASONS[message["stopReason"]],
                   "usage": {"input_tokens": usage.get("input", 0), "output_tokens": usage.get("output", 0),
                             "cache_read_input_tokens": usage.get("cacheRead", 0), "cache_creation_input_tokens": usage.get("cacheWrite", 0)}}}
    elif role == "toolResult":
        body = "\n".join(c.get("text", f"[{c['type']}]") for c in message["content"])
        record |= {"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": message["toolCallId"], "content": body, "is_error": message.get("isError", False)}]}}
    elif entry["type"] == "custom_message":
        content = entry.get("content", "")
        record |= {"type": "user", "isMeta": True, "message": {"role": "user", "content": text_blocks(content if content else json.dumps(entry)[:2000])}}
    else:
        continue
    # Neither a failed model call (no content: rate limit, abort) nor a Pi extension message (hidden in
    # the timeline) splits a run of context edits. The failed call is still kept: it marks where a turn ended.
    failed_call = record["type"] == "assistant" and not record["message"]["content"]
    if (pending_edits or pending_compaction) and not record.get("isMeta") and not failed_call:
        window += 1
        marker_id = f"window-{window}"
        out.append({"uuid": marker_id, "parentUuid": previous, "timestamp": entry["timestamp"],
                    "sessionId": header["id"], "cwd": header["cwd"], "isSidechain": False,
                    "type": "system", "subtype": "context_window",
                    "content": "compaction" if pending_compaction else "context edit"})
        record["parentUuid"] = marker_id
        pending_edits = 0
        pending_compaction = False
    out.append(record)
    previous = entry["id"]

temporary = tempfile.NamedTemporaryFile("w", dir=target.parent, prefix=f".{target.name}.", delete=False)
try:
    with temporary:
        for record in out:
            temporary.write(json.dumps(record) + "\n")
    os.replace(temporary.name, target)
except BaseException:
    os.unlink(temporary.name)
    raise
print(f"branch={len(branch)} written={len(out)} windows={window}")
