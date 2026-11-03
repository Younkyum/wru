# Demo video script (about 2:58)

`npm run video` builds the draft video from this script and rewrites this document. It works in three steps:

1. Each sentence is voiced with macOS `say` (Samantha).
2. Headless Chromium records `/demo?video=1` while the script drives demo mode. Negotiation messages appear in step with the narration, the approval button is pressed mid-sentence, and the thing each sentence talks about is highlighted on screen.
3. ffmpeg combines everything into `video-out/wru-demo.mp4` and subtitles `video-out/wru-demo.srt`.

The outputs are not committed. The narration source is `scripts/video/narration.ts`. To record a final voice-over, read each section at the start time below (draft timing, 0.35 s pause between sentences).

| Start | Cut | Screen | Rubric |
| --- | --- | --- | --- |
| 0:00 | Opening card | Dark card: WRU · typical location sharing (pins on a map) vs WRU (status chips) | Impact |
| 0:09 | 1. Status only | Three phones (Mom home · Dad on the way, 20 min · Brother near home) | Impact · Demo |
| 0:33 | 2. A task comes in | WRU bar shows the task (requested by Mom); each phone gets a "Family task" note | Demo |
| 0:41 | 3. Three Muses negotiate | Phones + Muse channel; a recorded live Muse Spark run (samples/negotiation-hero-muse.json) appears message by message in step with the narration | Use of Meta AI Tooling · Demo |
| 1:03 | 4. Only roles come out | WRU bar shows roles → Mom approves → each phone shows only its own role | Impact · Demo |
| 1:13 | 5. What the model sees | Phones fade; the panel shows the request body (no status), the tool calls with Dad's token (own 200, Mom 403), the response JSON, "The model decides / WRU enforces", a real filter rewrite | Use of Meta AI Tooling · Technical Depth |
| 1:41 | 6. Nobody can peek | Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted | Technical Depth |
| 1:56 | 7. Can the log reveal home? | Real Muse Spark run, Muse attacker. Three cards in order: gate off (50 logs, home 100% · school 70%) → gate on (9 logs, ceiling 28% · 32%, Muse attacker 4% · 4%, chance 4%) → agent knows its location (10 logs, ceiling 32% · 34%) | Technical Depth |
| 2:40 | Self-hosting | Terminal: cat .env shows a masked, read-only WhereCtx token for Mom; npm start prints the family (mom=location.example.com, dad=sim, sibling=sim) | Impact · Technical Depth |
| 2:53 | Closing card | Dark card: five-line summary + how the run was made | Use of Meta AI Tooling · Impact |

## Narration

### 0:00 Opening card

- Hi, I'm Younkyum Jin. I built WRU this week.
- "Who's picking up Mina?" Many families answer that by sharing their location all day.

### 0:09 1. Status only

- WRU, short for "where are you", lets each person's AI agent split the errands without sharing coordinates.
- Each person runs WhereCtx, their own location server from before the hackathon. WRU gets only a coarse status from it, like home or on the way, plus a rough ETA.
- Mom is home,
- Dad is twenty minutes out,
- and Brother is near home.

### 0:33 2. A task comes in

- Mom posts a task: pick up Mina from school and buy milk by 6 PM.
- The rule: one task per person.

### 0:41 3. Three Muses negotiate

- Mom hands it to the family's agents. Each one is a Muse running on Meta's Muse Spark, and this is a real run.
- Each Muse reads only its own status, through a tool call.
- Dad is already out and heading home, so he offers the pickup.
- Mom and Brother both offer the milk.
- Brother is near home, a better fit, so Mom steps back. Dad and Brother commit.

### 1:03 4. Only roles come out

- The result is just who does what, and Mom approves it once.
- Each phone gets only its own task: pickup for Dad, milk for Brother.

### 1:13 5. What the model sees

- Here is what Dad's Muse sends the model: no status at all, just the deadline and the messages so far.
- It calls get presence with Dad's own token. Asking for Mom's status returns 403.
- The model replies with one JSON object: which task, and how good a fit.
- WRU checks that the reply is valid and comes from the right agent.
- If the model slips a location into its reason, WRU swaps it for a fixed template before logging.

### 1:41 6. Nobody can peek

- Could one agent peek at another? Each one holds its own token.
- We send fifteen real requests: five callers, each asking about all three people.
- A request with Dad's token for Mom's status gets 403 Forbidden.

### 1:56 7. Can the log reveal home?

- Could these logs reveal home? We ran fifty families across Seoul's twenty-five districts, with Muse as agents and attacker.
- The privacy gate lets through only status and a rough ETA. Without it, agents chat freely and every family's log is unique.
- The Muse attacker then finds the home district 100 percent of the time.
- With the gate on, those fifty families produce just nine different logs.
- So even a best-case attacker finds the home district only 28 percent of the time.
- The Muse attacker got 4 percent, the same as random guessing.
- An agent that knows its exact location never gets it into the log, though its choices nudge the ceiling to 32 percent.

### 2:40 Self-hosting

- Each member adds a read-only token from their own WhereCtx. Here Mom's is real, the others simulated.
- One command starts the family server, and exact locations never leave each person's own server.

### 2:53 Closing card

- WRU runs on Muse Spark through the Meta Model API.

## Re-recording

- `npm run video` regenerates the draft in `video-out/` and refreshes the start times here. It fails if the video runs over 3 minutes.
- For your own voice, run `npm run video:cues`. It writes `video-out/voice/CUES.md`, which lists one file name per line. Record each line into that folder and run `npm run video` again. The screen waits for each recording, so timing follows your pace. Lines you skip use the macOS voice (`WRU_VIDEO_VOICE` / `WRU_VIDEO_RATE`). A human read usually runs longer than the TTS voice. Long pauses are shortened automatically, and `WRU_VOICE_TEMPO=1.2 WRU_VOICE_GAP=0.25 npm run video` speeds up only the voice, keeping its pitch (this is how the submitted cut was made).
- If you re-run `npm run leak` with a Meta Model API key, update the leak numbers in `scripts/video/narration.ts`.
- If you re-record with the real Muse, change the mock disclosure sentences (cut 4 and the closing card).
