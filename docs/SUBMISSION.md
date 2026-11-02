# WRU ("where are you"): family errands, split by AI agents without sharing coordinates

Meta Global AI Developer Hackathon (2026-10-26 to 11-04)

## Problem

To decide "who's picking up the kid?", a family has to know where everyone is right now. Many families turn on always-on location sharing. The only thing they actually needed was one answer: who can make it in time.

## Solution

WRU assigns roles without any person, agent or log seeing coordinates.

- **WhereCtx** (our existing personal location server) gives each person's coarse status only: `home` / `near_home` / `in_transit` and minutes to home. Detail and coordinate requests are refused, with `home_zone_refused` inside the home zone. Every person hosts their own.
- **Muse agents**: one per family member, built to call Meta's Muse Spark through the Meta Model API. Each agent reads only **its own** WhereCtx, through a token check. It never sees anyone else's status; all it knows about the others is their negotiation messages.
- **WRU** relays the negotiation. A task arrives in the inbox, the agents trade offer, counter, commit and refuse messages in rounds, and the result is an assignment. After one human approval, each person is notified of their own role only.

## Protocol

| Message | Fields | Meaning |
| --- | --- | --- |
| offer | from, subtask_id, fit (high/medium/low), reason | I can do this |
| counter | from, subtask_id, alternative, fit, reason | Someone fits better; I'll take another subtask |
| commit | from, subtask_id | Settled |
| refuse | from, subtask_id, reason_code | I can't (busy_in_transit, deadline_unreachable, …; templates only) |

- Each agent sends the model only its own state, an ETA range, minutes to the deadline and the messages so far. The model answers with one JSON object (`response_format: json_object`) that says which subtask to go for, how good a fit, and which message type.
- **WRU validates every move the model makes.** It checks the token, validates the schema, publishes every reason as a status template, and decides which commits stand. A commit stands only if the agent's claim has gone a full round unbeaten, and only within capacity (one task per person). Anything still open after the maximum rounds is unassigned.
- The outcome follows from status. At 17:30 Dad gets the pickup and Brother gets the milk; at 17:52 nobody can make the deadline and both stay unassigned.
- With a real Meta Model API key, any output that fails schema validation or the location check falls back to the template decision for the same input.

## Agent token boundary

WRU issues every family member an agent token. The server stores only SHA-256 hashes and compares them in constant time. An agent's token reads only its owner: someone else's gets 403, and a missing or forged token gets 401. The negotiation engine itself reads presence through this gateway with each agent's own token, so even the engine cannot read another member's status. With a real WhereCtx connected, the dashboard API fails closed without an admin token.

## Privacy gate

1. WhereCtx refuses location details.
2. Real Muse output is validated for schema and location patterns.
3. **Agents' own words are never published.** Reasons are replaced with stock status phrases, and ETAs are only ever shown as ranges.
4. Task labels containing location hints are rejected by the inbox.

## Leak numbers

We give an attacker only the negotiation log and ask which of Seoul's 25 districts the family's home and the child's school are in. There are 50 seeded scenarios, with different homes, schools and routes.

| Condition | Distinct logs | Hindsight bound (home · school) | Rule-based attacker (home · school) |
| --- | --- | --- | --- |
| Gate off (neighborhood, distance, exact ETA as-is) | 50 | **100% · 100%** | 98% · 72% |
| Gate on, agent secretly knows its location | 5 | 22% · 24% | 6% · 0% |
| Gate on (WRU default) | 5 | **22% · 24%** | 6% · 0% |
| Chance (1/25) | | 4% | 4% |

The hindsight bound groups identical logs and picks the right answer in hindsight, so no attacker can beat it on our 50 scenarios at district level. With the gate on, 50 different families produce only 5 distinct logs. The remaining 22% comes from the coarse status itself ("on the way, within 20 min"). The family chose to share that status, and no gate can remove it. Internal flags (fallback, filtered) are stripped from public logs, so an agent that secretly knows its location produces exactly the same logs as one that does not.

Quality-gate tests check API responses, the event log, every demo render, samples, the leak report and the docs for coordinate keys, decimal coordinates, street addresses, school names and Seoul place names: zero hits. The full suite has over 130 tests.

## Built during the hackathon vs. before

- **Built during the hackathon (from 2026-10-26)**: all of WRU. That covers the negotiation engine, Muse clients, privacy gate, leak test, demo UI, agent token boundary, HttpWhereCtx adapter, self-hosting setup and video pipeline. The repo's first commit is 2026-10-26.
- **Existed before**: WhereCtx, the personal location server, developed from 2026-06 to 10-19. It has no commits during the hackathon, and WRU only calls its public REST API.

## Limitations

- No Meta Model API key was available before the deadline, so the demo runs on a deterministic mock Muse with the same JSON schema. The real client path is tested with a fake fetch, and the model id is set with `MUSE_MODEL`.
- The rule-based attacker and the gate-off phrasing were written by the same team, which is why the hindsight bound is the headline number. With a key, `npm run leak` re-measures with Muse as both agent and attacker.
- The real WhereCtx integration was verified against a locally run WhereCtx; the video uses the simulator.
- The family screen shows exact ETA minutes per the Presence contract; negotiation logs carry only ranges.
- Task labels are free text. Shop names outside the word lists can get through, and some everyday words are rejected by mistake.
- Members are fixed to three seats and state lives in memory. Real family onboarding, push and accounts are out of scope.

## Run

```bash
npm install && npm run dev   # http://localhost:5173/demo → ▶ Demo mode
npm test                     # contract · negotiation · boundary · privacy · quality gate
npm run leak                 # leak test → leak-report.md
npm run video                # draft demo video → video-out/
```
