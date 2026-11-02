# Demo video script (about 2:42)

`npm run video` builds the draft video from this script and rewrites this document. It works in three steps:

1. Each sentence is voiced with macOS `say` (Samantha).
2. Headless Chromium records `/demo?video=1` while the script drives demo mode. Negotiation messages appear in step with the narration, the approval button is pressed mid-sentence, and the thing each sentence talks about is highlighted on screen.
3. ffmpeg combines everything into `video-out/wru-demo.mp4` and subtitles `video-out/wru-demo.srt`.

The outputs are not committed. The narration source is `scripts/video/narration.ts`. To record a final voice-over, read each section at the start time below (draft timing, 0.35 s pause between sentences).

| Start | Cut | Screen | Rubric |
| --- | --- | --- | --- |
| 0:00 | Opening card | Dark card: WRU · typical location sharing (pins on a map) vs WRU (status chips) | Impact |
| 0:16 | 1. Status only | Three phones (Mom home · Dad on the way, 20 min · Brother near home) | Impact · Demo |
| 0:30 | 2. A task comes in | WRU bar shows the task (requested by Mom); each phone gets a "Family task" note | Demo |
| 0:39 | 3. Three Muses negotiate | Phones + Muse channel; messages appear round by round in step with the narration | Use of Meta AI Tooling · Demo |
| 1:04 | 4. What goes to the model | Meta Model API request body (JSON) → response JSON, "The model decides / WRU enforces", a real filter rewrite | Use of Meta AI Tooling · Technical Depth |
| 1:27 | 5. Only roles come out | WRU bar shows roles → Mom approves → each phone shows only its own role | Impact · Demo |
| 1:35 | 6. Nobody can peek | Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted | Technical Depth |
| 1:49 | 7. Can the log reveal home? | Three cards in order: gate off (50 logs, home 98% · school 72%) → gate on (5 logs, ceiling 22% · 24%, rule-based attacker 6% · 0%, chance 4%) → agent secretly knows (same 5 logs) | Technical Depth |
| 2:25 | Self-hosting | Light card: WhereCtx token per person → family server .env and family.config.json → npm start / Docker | Impact · Technical Depth |
| 2:37 | Closing card | Dark card: five-line summary + mock disclosure | Use of Meta AI Tooling · Impact |

## Narration

### 0:00 Opening card

- "Who's picking up Mina?" Usually, answering that means everyone shares their live location all day.
- Or nobody answers the group chat until it is too late.
- WRU, short for "where are you", lets each person's AI agent split the errands without sharing coordinates.

### 0:16 1. Status only

- Each person runs WhereCtx, a small location server of their own.
- WRU only gets a coarse status from it: home, near home, or on the way.
- Mom is home, Dad is twenty minutes out, and Brother is near home.

### 0:30 2. A task comes in

- Mom posts a task: pick up Mina and buy milk by 6 pm. Mina's school is a fifteen-minute trip from home.
- The rule: one task per person.

### 0:39 3. Three Muses negotiate

- We call each agent a Muse. It runs on Meta's Muse Spark model.
- In this recording, a mock with the same output format stands in for the model.
- In round one, everyone who can make it in time offers to do the pickup.
- Dad is already out with time to spare, so he's the best fit for the pickup.
- Mom and Brother both offer to get the milk instead.
- Brother is near home, so Mom steps aside.

### 1:04 4. What goes to the model

- This is everything Dad's Muse sends to the model:
- its own state, an ETA range, minutes to the deadline, and the messages so far.
- The model replies with one JSON object: which task, and how good a fit.
- WRU checks that the reply is valid and comes from the right agent.
- If the model slips a location into its reason, the log still only shows a fixed sentence.

### 1:27 5. Only roles come out

- What comes out is roles. Mom approves once,
- and each phone gets only its own job: pickup for Dad, milk for Brother.

### 1:35 6. Nobody can peek

- Could one agent peek at another? Each one holds its own token.
- Dad's token asking for Mom's status gets a 403.
- That is every agent asking about every person: fifteen real requests, just sent.

### 1:49 7. Can the log reveal home?

- Could these logs reveal where the family lives? We tried fifty families across Seoul's twenty-five districts.
- Without the privacy gate, which hides everything but status, every log is different.
- A simple attacker then finds the home district 98 percent of the time.
- With the gate on, those fifty families produce just five different logs.
- Even the best possible guess, made in hindsight, is right only 22 percent of the time.
- That floor comes from the status itself. The negotiation adds nothing.
- And an agent that secretly knows its exact location produces the very same logs.

### 2:25 Self-hosting

- One family runs one server.
- Each member adds a read-only token from their own WhereCtx, and one command starts the server.
- Locations never leave each person's own server.

### 2:37 Closing card

- Add a Meta API key, and the same code calls Muse Spark.

## Re-recording

- `npm run video` regenerates the draft in `video-out/` and refreshes the start times here. It fails if the video runs over 3 minutes.
- For your own voice, either change the draft voice and speed with `WRU_VIDEO_VOICE` / `WRU_VIDEO_RATE`, or strip the draft audio and lay a new recording over it.
- If you re-run `npm run leak` with a Meta Model API key, update the leak numbers in `scripts/video/narration.ts`.
- If you re-record with the real Muse, change the mock disclosure sentences (cut 4 and the closing card).
