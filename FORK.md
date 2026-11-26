---
description: How this fork differs from upstream driangle/vibeview, and why
last_updated: 2026-11-26 15:30
---

# FORK.md

This repository is a fork of [driangle/vibeview](https://github.com/driangle/vibeview). `origin` is the fork; `upstream` is the original. To take upstream changes, `git fetch upstream && git merge upstream/main`; where a file below conflicts, keep the fork's side of the difference it lists.

## Intentional differences

- **Pi sessions, through a converter.** `scripts/pi_to_vibeview.py` turns a Pi session into Claude Code's format. why:: vibeview reads only Claude Code sessions. The converted file carries two additions vibeview reads: each assistant call's `stop_reason` (`claude.APIMessage.StopReason`), and a `system` message with `subtype: context_window` where a context window starts.
- **The session page is the timeline table alone.** No Conversation tab, session header, sidebar, toolbar, overview strip or footer, and no top nav bar on that page. why:: one dense, scannable view of a long session. Code: `apps/web/src/components/timeline-track/`, `pages/SessionView.tsx`.
- **The session page is a snapshot.** It is read once per page load (`hooks/useSessionData.ts`, `swr/immutable`); the session stream hook is removed. why:: a page that updates while open can show rows out of step with their data; reloading is explicit. The server's stream endpoint is unchanged and unused.
- **Turns survive mid-turn prompts.** A prompt sent while the agent's turn continues (its last call stopped with `tool_use`) does not split the turn's tool calls from the reply they lead to. Code: `buildTrackItems` in `trackItems.ts`.
- **Prompt previews drop harness wrappers.** Plannotator Inbox headers and instructions and Pi's time notices are stripped, and the thread name becomes `promptSource`; previews are 300 characters. why:: most prompts in a Pi session are Inbox replies, whose previews were all boilerplate. Code: `apps/lib/timeline/metrics.go`.
- **Token counts are estimates of row size.** Each row shows its own text and its tool calls at about four characters per token, not the model calls' usage; a window line shows the largest context any call in it sent. Code: `tokens.ts`, `trackItems.ts`.
- **Session messages convert on every core.** `toMessages` in `apps/lib/sessiondetail/sessiondetail.go`. why:: redaction made a 14k-message session take 7.4 s to load; now about 3 s. Not fork-specific: a candidate to send upstream.

## Open questions

- Upstream's `CLAUDE.md` says the backend owns domain logic and every new behavior gets a test. The timeline's row building, token estimates and search run in the browser and have no tests, and four `TimelineTab.test.tsx` tests fail against the new layout. Undecided: adopt this as the fork's rule, or move the logic to Go and test it.
