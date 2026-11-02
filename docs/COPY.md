# On-screen copy and video lines (for the submitter to review)

All copy that appears on the demo screen and in the video, in one place. If you change a line here, change the source file too. Leak numbers are filled in automatically from `npm run leak` (`samples/leak-report.json`).

## Fixed UI copy

The screen is three family phones (Mom · Dad · Brother), a WRU bar on top, and a right column (Muse channel / Token boundary / Leak test). Each phone shows only that person's own status and what their own Muse said.

| Where | Copy | File |
| --- | --- | --- |
| Header | WRU · Family errands, split by AI agents — no coordinates | `src/web/DemoPage.tsx` |
| Header button | ▶ Demo mode | 〃 |
| Phone header | Mom / Dad / Brother · my WhereCtx · my Muse · token fingerprint | 〃 |
| Phone status card | Home · At home now / On the way · About 20 min from home / Near home · About 8 min from home | 〃, `src/shared/contracts.ts` |
| Phone empty state | No one else's location is on this phone. | 〃 |
| Phone task note | Family task · by 18:00 / Pick up Mina + Buy milk | 〃 |
| Phone role card | Dad, you're on: Pick up Mina (by 18:00) / Mom, nothing for you this time | `src/server/negotiation/engine.ts` |
| WRU bar (empty) | No family task yet · Add a task and the three Muses split it up · [＋ Pick up Mina + buy milk by 6 pm] | `src/web/DemoPage.tsx` |
| WRU bar (task) | Pick up Mina + Buy milk · by 18:00 · Requested by Mom · one task per person · [Hand it to the three Muses] | 〃 |
| WRU bar (result) | Dad = Pick up Mina · Brother = Buy milk · [Mom approves & notifies] → Approved by Mom · each person got only their own role | 〃 |
| Muse channel | agent Muse → Meta Model API → model Muse Spark | 〃 |
| Token boundary | Real GET /api/agent/presence/:id requests with each agent token · 200 allowed / 403 denied / 401 denied | 〃 |
| What goes to the model | The model decides / WRU enforces · Request POST /v1/chat/completions · Response (one JSON object) · Even if the model slips in a location (real filter code) | 〃 |
| Leak test | Best any adversary could do · What the rule-based adversary actually hit · Log line | 〃 |
| Footer | No coordinates, addresses or school names are collected or shown. From WhereCtx we only take status and ETA. | 〃 |

## Agent message templates (gate on)

| Situation | Copy | File |
| --- | --- | --- |
| Pickup · on the way | I'm already out and can stop by on the way (home within 20 min) | `src/server/muse/policy.ts` |
| Pickup · near home | I'm near home and can make the trip | 〃 |
| Pickup · home | I can make it if I leave home now | 〃 |
| Errand · near home | I'm near home, easy to drop by | 〃 |
| Errand · on the way | I can pick it up on my way home (home within 20 min) | 〃 |
| Errand · home | I can pop out from home | 〃 |
| Counter | Someone fits better, so I'll switch. (+ one of the above) | 〃 |
| Refuse | I'm on the way — sharing my ETA only / I'm near home but can't take it now / Someone already took it / I'm already on another task / I can't make the deadline / Someone else is a better fit | `src/shared/negotiation.ts` |
| Location request refused | Location details are not shared. Only status and ETA are available. / Inside the home zone, location details are not shared. Only status is available. | `src/server/wherectx/adapter.ts` |

## Demo mode (8 cuts)

File: `src/web/demoSteps.ts`. Captions with numbers are filled in from the leak report.

| Cut | Title |
| --- | --- |
| 1 | A map without coordinates |
| 2 | A task comes in |
| 3 | Three Muses negotiate |
| 4 | What goes to the model |
| 5 | Roles, not locations |
| 6 | Nobody can peek |
| 7 | Can the log reveal home? |
| 8 | Same log, even if it knows |

## Video narration and subtitles

The source is `scripts/video/narration.ts`. Start times, every sentence and what each sentence highlights are in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md), which `npm run video` rewrites.

## Checklist

- [ ] "Mina" is a made-up child's name. Do not replace it with a real one.
- [ ] Current leak numbers: gate on — 5 distinct logs, best any adversary could do home 22% · school 24%, rule-based adversary home 6% · school 0%; gate off — home 98% · school 72%; chance 4%.
- [ ] Leak numbers come from the mock adversary and the adversary-independent bound. If you re-run `npm run leak` with a Meta Model API key, on-screen captions update automatically; video narration does not.
- [ ] The model id is set with `MUSE_MODEL` and is not shown on screen.
