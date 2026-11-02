# Demo video script (about 2:48)

`npm run video` builds the draft video from this script and rewrites this document. It works in three steps:

1. Each sentence is voiced with macOS `say` (Samantha).
2. Headless Chromium records `/demo?video=1` while the script drives demo mode. Negotiation messages appear in step with the narration, the approval button is pressed mid-sentence, and the thing each sentence talks about is highlighted on screen.
3. ffmpeg combines everything into `video-out/wru-demo.mp4` and subtitles `video-out/wru-demo.srt`.

The outputs are not committed. The narration source is `scripts/video/narration.ts`. To record a final voice-over, read each section at the start time below (draft timing, 0.35 s pause between sentences).

| Start | Cut | Screen | Rubric |
| --- | --- | --- | --- |
| 0:00 | Opening card | Dark card: WRU · typical location sharing (pins on a map) vs WRU (status chips) | Impact |
| 0:12 | 1. A map without coordinates | Three phones (Mom home · Dad on the way, 20 min · Brother near home) | Impact · Demo |
| 0:27 | 2. A task comes in | WRU bar shows the task (requested by Mom); each phone gets a "Family task" note | Demo |
| 0:33 | 3. Three Muses negotiate | Phones + Muse channel; messages appear round by round in step with the narration | Use of Meta AI Tooling · Demo |
| 0:57 | 4. What goes to the model | Meta Model API request body (JSON) → response JSON, "The model decides / WRU enforces", a real filter rewrite | Use of Meta AI Tooling · Technical Depth |
| 1:18 | 5. Roles, not locations | WRU bar shows roles → Mom approves → each phone shows only its own role | Impact · Demo |
| 1:26 | 6. Nobody can peek | Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted | Technical Depth |
| 1:39 | 7. Can the log reveal home? | Gate-on card: 5 distinct logs · best any adversary could do: home 22% · school 24% (chance 4%); rule-based adversary 6% · 0% | Technical Depth |
| 2:08 | 8. Same log, even if it knows | Three cards: agent knows its location (center) · gate on · gate off 98% · 72%, bound 100% | Technical Depth |
| 2:26 | Self-hosting | Light card: WhereCtx token per person → family server .env and family.config.json → npm start / Docker | Impact · Technical Depth |
| 2:37 | Closing card | Dark card: five-line summary + mock disclosure | Use of Meta AI Tooling · Impact |

## Narration

### 0:00 Opening card

- "Who's picking up Mina?" To answer that,
- should a family stream everyone's coordinates to a server all day?
- WRU lets each family member's AI agent split the errands, with no coordinates.

### 0:12 1. A map without coordinates

- Each person keeps their location on their own server, called WhereCtx.
- WRU only receives a coarse status: home, near home, or on the way.
- Mom is home, Dad is twenty minutes out, Brother is near home.

### 0:27 2. A task comes in

- Mom posts a task: pick up Mina and buy milk by six.
- One task per person.

### 0:33 3. Three Muses negotiate

- Each agent, a Muse, is built to call Meta's Muse Spark model.
- In this recording, a mock with the same schema answers in its place.
- Round one: everyone who can make the deadline offers to do the pickup.
- Dad is already out with time to spare, so his fit is high.
- Mom and Brother switch to the milk, and Dad commits to the pickup.
- Brother is near home, so Mom yields the milk to him.

### 0:57 4. What goes to the model

- This is everything Dad's Muse sends to the model:
- its own state, an ETA range, minutes to the deadline, and the messages so far.
- The model answers with one JSON object: which task, and how good a fit.
- WRU checks the token and the schema.
- Even if the model slips in a location, only a status template reaches the log.

### 1:18 5. Roles, not locations

- What comes out is roles. Mom approves once,
- and Dad's phone says pickup, Brother's says milk. Nothing else.

### 1:26 6. Nobody can peek

- Could one agent peek at another? Every agent reads its own status with its own token.
- Dad's token asking for Mom's status gets a 403.
- These are fifteen real requests just sent to the server.

### 1:39 7. Can the log reveal home?

- Can anyone find the home from this log?
- We ran fifty scenarios with different homes and schools across Seoul's twenty-five districts.
- They produced only five distinct logs. Different homes, same log.
- So even an ideal adversary tops out at home 22 percent, school 24 percent.
- That is exactly what the shared status alone reveals. The negotiation adds nothing on top.
- A rule-based adversary scanning the log hit home 6 percent, school 0 percent.

### 2:08 8. Same log, even if it knows

- In the middle, we secretly handed each agent its exact location.
- The filter still publishes the very same log as the default, character for character.
- Turn the gate off, and all fifty logs differ. The same adversary hits home 98 percent, school 72 percent.

### 2:26 Self-hosting

- A family runs one server. Each person adds a read-only key from their own WhereCtx, then runs npm start.
- The server then gives each agent its own agent token.

### 2:37 Closing card

- Status in, roles out. No coordinates in between.
- The model in this recording is a mock. Add a key, and Muse Spark answers on the same path.

## Re-recording

- `npm run video` regenerates the draft in `video-out/` and refreshes the start times here. It fails if the video runs over 3 minutes.
- For your own voice, either change the draft voice and speed with `WRU_VIDEO_VOICE` / `WRU_VIDEO_RATE`, or strip the draft audio and lay a new recording over it.
- If you re-run `npm run leak` with a Meta Model API key, update the leak numbers in `scripts/video/narration.ts`.
- If you re-record with the real Muse, change the mock disclosure sentences (cut 4 and the closing card).
