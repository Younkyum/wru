# Independent critique loop

Each round, two **fresh** sub-agents saw only that round's artifacts: video frames (one per subtitle sentence), subtitles, the script and the on-screen copy. Neither got earlier conclusions or our intent.

- **Presentation critic**: a judge's view — story, whether it lands in 3 minutes, rubric coverage (Impact 30 · Use of Meta AI Tooling 25 · Technical Depth 20 · Demo 25), pacing.
- **Design critic**: visual hierarchy, legibility at video size, consistency, readability in the video frame.

Scores are each critic's own score out of 10. Rounds 1–6 judged the Korean draft; from round 7 the demo, video and docs are in English (the submission language).

Outcome markers: ✅ fixed · ➖ deferred (with reason) · ❌ not adopted (with reason).

## Scores

| Round | Presentation | Design | Main change that round |
| --- | --- | --- | --- |
| 1 | 5 | 6.5 | Added the "what goes to the model" cut; synced negotiation to narration |
| 2 | 5 | 6.5 | Fixed the negotiation logic in the narration; "model decides / WRU enforces"; zoom |
| 3 | 5 | 6.5 | **Structural**: video layout shows only what each cut needs; adversary-independent bound; stripped internal flags from public logs |
| 4 | 5.5 | 6.5 | Honest wording for the 22% bound; requester approval; colour clean-up |
| 5 | 6 | 6.5 | **Structural**: per-sentence highlight; the bound became the headline leak metric |
| 6 | 6 | 7 | Real filter rewrite shown; intro contrast card; self-hosting cut |
| 7 | 5.5 | 6.5 | Switched to English; fixed layouts the longer English copy broke |
| 8 | see below | | |

## Rounds 1–6 (Korean draft), condensed

| Round | Critic | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| 1 | Presentation | HIGH: no visible Meta AI usage; the LLM seems to do nothing | ✅ New cut showing the exact Meta Model API request body built by the real client code, the JSON response, and what WRU checks. A real call is ➖ deferred (no API key) |
| 1 | Presentation | HIGH: leak claim overstated ("same as guessing") | ✅ Toned down; adversary described as rule-based |
| 1 | Presentation | MED: negotiation finished before the narration did | ✅ Messages revealed in step with the narration |
| 1 | Design | HIGH: static 14 s intro, tiny text, muddy dimming, subtitles colliding with UI | ✅ Staged intro, larger video text, greyscale dimming, fixed-width subtitles |
| 2 | Presentation | HIGH: "Mom yields to the closer brother" read backwards | ✅ Reasons now match on-screen state |
| 2 | Presentation | HIGH: middle leak condition looked copy-pasted | ✅ Explained why it equals gate on; added example log lines |
| 2 | Design | HIGH: mock disclosure hidden under subtitles | ✅ Disclosure moved to the top of the panel |
| 3 | Presentation | HIGH: the leak experiment is circular (rule-based adversary vs. a gate that removes the same words) | ✅ **Structural**: added an adversary-independent upper bound (group identical logs, pick the right answer in hindsight). This exposed a real leak: internal `fallback`/`filtered` flags told an outsider an agent had tried to say something else. Removed from public logs and the API |
| 3 | Design | HIGH (repeated in rounds 1–3): dimming, subtitle collisions, small text | ✅ **Structural**: in video mode each cut shows only the regions it needs and hides the rest; solo panels are enlarged; a 150 px subtitle band is reserved |
| 4 | Presentation | HIGH: "bound 22%" sounded reassuring | ✅ Narrated honestly: it is what the status itself reveals |
| 4 | Design | HIGH: asked for dimming back | ❌ Dimming caused the round 1–3 complaints; solo panels were centred and enlarged instead |
| 5 | Presentation | HIGH: strongest claim rested on the weakest evidence | ✅ **Structural**: the adversary-independent bound became the headline number; rule-based hits became secondary |
| 5 | Design | HIGH: nothing on screen points at what the narration names (the real cause of the repeated 6.5) | ✅ **Structural**: every sentence names a highlight target (phone, matrix cell, request/response, leak card) |
| 6 | Presentation | HIGH: "WRU rewrites reasons" was never shown | ✅ The real `filterMessage` output is shown: a location-laden sentence → the published template |
| 6 | Design | MED: broken JSON wrap, highlight colour clashing with status blue | ✅ JSON no longer wraps; highlight ring is ink, not blue |

Throughout, the presentation critic's top finding has been that no real Muse Spark call appears. That stays ➖: no Meta Model API key was issued before the deadline. The video discloses the mock when the model is first mentioned and on the closing card.

## Round 7 (first English draft)

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 5.5 (Impact 6 · Tooling 3 · Depth 7 · Demo 6) | HIGH: Muse Spark never actually runs | ➖ No key |
| | | HIGH: a deterministic rule produces the "right" split, so why an LLM? | ➖ Needs a real model (e.g. free-text tasks); not demonstrable with the mock |
| | | HIGH: 22% vs 4% chance looks like a celebrated leak | ✅ Reframed as "exactly what the shared status alone reveals; the negotiation adds nothing", next to full sharing's 100% |
| | | MED: self-hosting subtitles unreadable; two kinds of "token" | ✅ Light cards use the dark subtitle box; "read-only key" (WhereCtx) vs "agent token" (WRU) |
| | | MED: plumbing (token matrix) before the payoff | ✅ Token cut moved after roles ("Nobody can peek") |
| | | LOW: Korean placeholder, stiff English | ✅ "[neighbourhood]", rewritten lines |
| Design | 6.5 | HIGH: subtitles over phones in the negotiation cut, muddy grey dimming, tight outlines | ✅ Shorter phones in video mode, dim only the phone screen (bezel stays), larger outline offset |
| | | MED: self-hosting card alignment, outro spacing, subtitle box width jumps | ✅ Grid-aligned steps, more outro spacing, fixed subtitle width |

## Round 8

From this round a third reviewer joined: an **English copy critic** (native-speaker editor) who flags AI-written or translated tells in the narration, on-screen copy and docs. Examples: em dashes, "X, not Y" formulas, slogan fragments, inconsistent terms, sentences too long to speak.

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 5.5 (Impact 6 · Tooling 3 · Depth 7 · Demo 6) | HIGH: Muse Spark never runs | ➖ No key |
| | | HIGH: 22% presented as reassuring | ✅ "An attacker with perfect hindsight finds the home district only 22% of the time. That is what the shared status already reveals; the negotiation adds nothing", with the 4% chance in the same sentence |
| | | MED: WhereCtx never explained; cut 1 has no map | ✅ "WhereCtx, a small location server of their own"; cut renamed "Status only" |
| | | MED: scenario too easy (looks like a sort) | ➖ Would change the hero scenario; deferred |
| | | MED: slip example uses placeholders | ❌ The quality gate forbids place names and distances on screen, even in examples; kept "[neighbourhood]" |
| Design | 7.5 | HIGH: self-hosting card top-heavy, inconsistent dim levels, double ring, tiny secondary text | ✅ Card centred with darker text, one dim level (0.45), single 2.5 px ring, 14 px minimum for secondary text in video mode |
| | | MED: low-contrast "Muse: mock", weak intro map | ✅ Darker grey, higher-contrast map |
| English copy | narration 6 · SUBMISSION 6.5 · README 6 · COPY 7 · leak report 6.5 | HIGH: climax lines (31–34) unclear when heard ("in the middle", gate/filter/default for one thing) | ✅ Rewritten: "Now we secretly give each agent its exact location. The log doesn't change by a single character. Switch the privacy gate off…" |
| | | HIGH: leak report said gate-on hits were "the same as chance" while its table shows 6% vs 4% | ✅ "close to chance"; footnote explaining the replaced-wording column |
| | | HIGH: token/key naming inconsistent, `_SIBLING` vs "Brother" | ✅ "read-only token" (WhereCtx) vs "agent token" (WRU); README notes `sibling` = Brother |
| | | MED: em dashes, "X, not Y" formulas, slogan fragments, "judges commits" | ✅ Em dashes removed from README, SUBMISSION and COPY; formulas rewritten as plain statements; one tagline kept for the closing card |

## Round 9

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 5.5 (Impact 6 · Tooling 3 · Depth 7 · Demo 7) | HIGH: no real Muse Spark exchange; model's role looks thin | ➖ No key. The model's role is stated once ("which task, and how good a fit") and the mock is disclosed when the model is introduced |
| | | HIGH: "22%" still heard as a leak | ✅ **Structural**: the two leak cuts merged into one ordered story: gate off (every log differs, 98%) → gate on (5 logs, ceiling 22%, "that much comes from the status alone; the negotiation adds nothing") → agent that secretly knows (same logs) |
| | | MED: "Brother is closer" implies location; 90 s of internals; no "why agents" line | ✅ "Brother is near home, so Mom backs off"; leak section shortened to one cut; intro adds "Or nobody answers the group chat until it is too late" |
| | | LOW: "key" vs "token" | ✅ "read-only token" everywhere |
| Design | 7 | HIGH: subtitle over the model panel's key line; small code text; channel header wrap | ✅ Mock banner folded into the panel subtitle to free space; wider panel; code 14 px; header no-wrap |
| | | MED: double focus ring, dim cells unreadable, intro tagline contrast | ✅ Dimmed matrix cells at 0.55, tagline #cfcfcf, intro cards scaled up |
| English copy | narration 6.5 · SUBMISSION 7 · README 7.5 · COPY 8 · leak report 6.5 | HIGH: question split across cues; hard-to-follow milk exchange; "So…" opener with unexplained jargon; 7-second cue | ✅ All four rewritten; long cue split |
| | | HIGH: bound overclaimed ("bounds every adversary"); confusing 0/386 column | ✅ "on these scenarios, at district level"; column renamed "Agent wording that differed from the template" with a footnote |
| | | MED: attacker vs adversary, WRU never spelled out, "ETAs leave", formula phrases, British/American mix | ✅ "attacker" in narration, UI and docs; "WRU, short for 'where are you'"; "are only ever shown as ranges"; formulas rewritten; American spelling throughout |

## Round 10

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 5.5 (Impact 6 · Tooling 3 · Depth 7 · Demo 7) | HIGH: Muse Spark never runs; nothing shows why an LLM is needed (e.g. a free-text constraint) | ➖ Both need a real model. Faking a free-text effect with the mock would misrepresent the system, so we did not |
| | | MED: "without anyone sharing a location" overclaims (ETA ranges still go out) | ✅ "without sharing coordinates" |
| | | MED: Mom's low pickup fit unexplained | ✅ "Mina's school is a 15-minute trip from home" |
| | | MED: 22% framing; LOW: "Nothing else" vs screen | ✅ "That floor comes from the status itself"; "each phone gets only its own job" |
| Design | 7 | HIGH: dimming too strong in the model cut (the strikethrough and safe sentence vanish); muddy phones; dimmed text unreadable | ✅ One lighter dim (0.6), no blur, phones desaturated rather than greyed; secondary text darkened |
| | | MED: leak label wrap, intro card pairing, host title | ✅ Label no-wrap, larger bound numbers, green border on the WRU card, larger host title |
| English copy | narration 7 · SUBMISSION 6 · README 6.5 · COPY 6.5 · leak report 5.5 | HIGH: "an attacker who knew every answer could only reach 22%" sounds contradictory; "which it calls"; closing overclaim; hard-to-follow offers | ✅ "Even the best possible guess, made in hindsight, is right only 22% of the time"; "We call each agent a Muse. It runs on Meta's Muse Spark model."; "Add a Meta API key, and the same code calls Muse Spark."; offers split into short lines |
| | | HIGH: README item 7 too long; SUBMISSION "So…" opener and unsupported "stored indefinitely"; leak report phrasing | ✅ Split into short sentences; claims removed; report wording rewritten, column renamed "Rewritten messages" |

## Round 11

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 5.5 (Impact 6 · Tooling 3 · Depth 7 · Demo 7) | HIGH: Muse Spark never runs; the model's job is thin | ➖ Needs a key |
| | | HIGH: "That floor" is wrong (the 22% is a ceiling) and still reads as a leak | ✅ "That 22% is what the status alone reveals. The negotiation leaks nothing extra." |
| | | MED: "15 requests" did not add up; "everything Dad's Muse sends" overclaims (no system prompt shown); fit logic unexplained | ✅ "Three agent tokens, no token and a forged one, each asking about all three people"; "the data Dad's Muse sends"; "Fit comes from status alone…" |
| | | LOW: "Meta API key" vs `MODEL_API_KEY` on the card | ✅ Narration says `MODEL_API_KEY` |
| Design | 7 | HIGH: small phone text, dimming, subtitle bar, ring colour | ✅ Phone meta 13 px/600, ETA 15 px, darker 403 text and lighter 401 grey, one subtitle style on every scene. Ring colour ➖: earlier rounds asked for it not to clash with the blue status colour |
| English copy | narration 7 · SUBMISSION 7 · README 7.5 · COPY 8 · leak report 6.5 | HIGH: "floor" vs "ceiling"; "15 requests"; "What comes out is roles" | ✅ All three fixed |
| | | HIGH: attacker vs adversary in the docs | ✅ "attacker" throughout the docs (code identifiers keep `adversary`) |
| | | MED: "runs on" overclaims; "tried 50 families"; formula sentences; "So we also…"; colon formula; "location detail" | ✅ "built for"; "simulated 50 families"; formulas and "So" openers rewritten; "location details" |

## Round 12 (final)

| Critic | Score | Key finding (severity) | Outcome |
| --- | --- | --- | --- |
| Presentation | 6 (Impact 6 · Tooling 4 · Depth 7 · Demo 7) | HIGH: no real Muse Spark call; the model's job looks like something a rule could do | ➖ **Blocked on the API key.** Both need a real model (a live turn, or free-text task parsing). Faking either with the mock would misrepresent the system |
| | | MED: "only 22%" reads as spin; "secretly knows" is weak with a mock; 8 s of empty channel; gate-off looks like a strawman | ✅ "right only 22% of the time, against 4% for random guessing. All of that comes from the coarse status"; "in our test"; round 1 starts under the mock disclosure; gate-off card labelled "naive agent chat" |
| Design | 7 | Re-tunes the same knobs as earlier rounds (dim strength, ring colour, code size), often in the opposite direction | ➖ Kept the round-10 settings; the remaining requests conflict with earlier rounds |
| English copy | narration 7 · SUBMISSION 7 · README 7.5 · COPY 6.5 · leak report 7 | HIGH: verbless list for the 15 requests; "made in hindsight"; "leaks nothing extra" overclaims; middle-dot separators; three names for the bound | ✅ Rewritten lines; middle dots in the docs' prose and tables replaced with commas; one name everywhere: **best-case attacker** |

## Where it ended

- Presentation rose from 5 to 6, and Meta tooling from 3 to 4. The remaining gap is a real Muse Spark call, which is blocked until the Meta Model API key arrives.
- Design rose from 6.5 to 7–7.5 after three structural changes: the per-cut layout, the per-sentence highlight, and the leak story told in order.
- English copy rose from 6 to 7–7.5 for the narration and docs.
- Several real defects were found and fixed along the way:
  - Internal flags leaked "the agent tried to say something else" into public logs.
  - The bound was mislabelled as a "floor".
  - The leak report's text contradicted its own table.
