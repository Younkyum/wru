# On-screen copy and video lines (for the submitter to review)

All copy that appears on the demo screen and in the video, in one place. If you change a line here, change the source file too. Leak numbers are filled in automatically from `npm run leak` (`samples/leak-report.json`).

## Fixed UI copy

The screen is three family phones (Mom · Dad · Brother), a WRU bar on top, and a right column (Muse channel / Model / Token boundary / Leak test). Each phone shows only that person's own status and what their own Muse said.

| Where | Copy | File |
| --- | --- | --- |
| Header | WRU · AI agents split family errands. No coordinates shared. | `src/web/DemoPage.tsx` |
| Header button | ▶ Demo mode | 〃 |
| Phone header | Mom / Dad / Brother · my WhereCtx · my Muse · token fingerprint | 〃 |
| Phone status card | Home · At home now / On the way · About 20 min from home / Near home · About 8 min from home | 〃, `src/shared/contracts.ts` |
| Phone empty state | This phone never shows anyone else's location. | 〃 |
| Phone task note | Family task · by 6 PM / Pick up Mina + Buy milk | 〃 |
| Phone role card | Dad, you're on: Pick up Mina (by 6 PM) / Mom, nothing for you this time | `src/server/negotiation/engine.ts` |
| WRU bar (empty) | No family task yet · Add a task and the three Muses split it up · [＋ Pick up Mina + buy milk by 6 PM] | `src/web/DemoPage.tsx` |
| WRU bar (task) | Pick up Mina + Buy milk · by 6 PM · Requested by Mom · one task per person · [Hand it to the three Muses] | 〃 |
| WRU bar (result) | Dad = Pick up Mina · Brother = Buy milk · [Approve as Mom & notify] → Approved by Mom · each person got only their own role | 〃 |
| Muse channel | Muse agent → Meta Model API → Muse Spark | 〃 |
| Token boundary | Real GET /api/agent/presence/:id requests with each agent token · 200 allowed / 403 denied / 401 denied | 〃 |
| What the model sees | One turn from Dad's agent: it reads its own status through a tool, never from the prompt. · The model decides / WRU enforces · Request POST /v1/chat/completions (tools: get_presence, get_eta · response_format: json_schema) · Tool calls with Dad's own token (real gateway): own → status, Mom → 403 · Response (one JSON object) · Even if the model slips in a location (real filter code) | 〃 |
| Leak test | Best-case attacker (knows which families share each log) · What a Muse attacker actually found · Log line | 〃 |
| Footer | No coordinates, addresses or school names are collected or shown. From WhereCtx we only take status and ETA. | 〃 |
| Phone messages | I'll pick up Mina / I'll buy milk instead / Pick up Mina (under COMMIT) / "Dad's Muse is thinking" (video) | 〃 |
| Video only | Browser tab "WRU · <chapter>", terminal: `cat .env` (masked) → `npm start` | `src/web/DemoPage.tsx` |

## Agent message templates (gate on)

| Situation | Copy | File |
| --- | --- | --- |
| Pickup · on the way | I'm already out and can stop by on the way (home within 20 min) | `src/server/muse/policy.ts` |
| Pickup · near home | I'm near home and can make the trip | 〃 |
| Pickup · home | I can make it if I leave home now | 〃 |
| Errand · near home | I'm near home, easy to drop by | 〃 |
| Errand · on the way | I can pick it up on my way home (home within 20 min) | 〃 |
| Errand · home | I can run out from home | 〃 |
| Counter | Someone fits better, so I'll switch. (+ one of the above) | 〃 |
| Refuse | I'm out and can't take this one / I'm near home but can't take it now / Someone already took it / I'm already on another task / I can't make the deadline / Someone else is a better fit | `src/shared/negotiation.ts` |
| Location request refused | Location details are not shared. Only status and ETA are available. / Inside the home zone, location details are not shared. Only status is available. | `src/server/wherectx/adapter.ts` |

## Demo mode (7 cuts)

File: `src/web/demoSteps.ts`. Captions with numbers are filled in from the leak report.

| Cut | Title |
| --- | --- |
| 1 | Status only |
| 2 | A task comes in |
| 3 | Three Muses negotiate |
| 4 | What the model sees |
| 5 | Only roles come out |
| 6 | Nobody can peek |
| 7 | Can the log reveal home? |

## Video narration and subtitles

The source is `scripts/video/narration.ts`. Start times, every sentence and what each sentence highlights are in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md), which `npm run video` rewrites.

## Checklist

- [ ] "Mina" is a made-up child's name. Do not replace it with a real one.
- [ ] Current leak numbers (real Muse Spark run, Muse attacker). Gate on: 9 distinct logs, best-case attacker home 28% · school 32%, Muse attacker home 4% · school 4%. Agent knows its location: 10 logs, 32% · 34%, Muse attacker 6% · 10%. Gate off: Muse attacker home 100% · school 70%. Chance 4%.
- [ ] The negotiation in the video is a recorded live Muse Spark run (`npm run muse:hero` → `samples/negotiation-hero-muse.json`), replayed so the timing is fixed. Re-recording can change the messages, so check the narration still matches before re-rendering.
- [ ] The model id is set with `MUSE_MODEL` and is not shown on screen.
