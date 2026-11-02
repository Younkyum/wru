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
