# WRU leak test report

We give an attacker ("adversary") nothing but the negotiation log and ask it to guess which of Seoul's 25 districts (gu) the family's **home** and the child's **school** are in.

- Trials: 50 per condition (scenario seeds 1 to 50; home, school and routes differ per seed)
- Attacker: rule-based mock attacker (scores districts from neighborhood names, remaining distance and ETA found in the log text; it never sees the scenario answers)
- Negotiating agents: deterministic mock Muse
- Chance: 1/25 = 4.0%

| Condition | Distinct logs | Ceiling: best any attacker could do (home · school) | Rule-based attacker: home | Rule-based attacker: school | Messages/labels with location hints | Rewritten messages¹ |
| --- | --- | --- | --- | --- | --- | --- |
| **gate on** (detail refused · status templates · ETA ranges) | 5 | 22.0% · 24.0% | 3/50 (6.0%) | 0/50 (0.0%) | 0 | 0/386 |
| gate on, agent secretly knows its location | 5 | 22.0% · 24.0% | 3/50 (6.0%) | 0/50 (0.0%) | 0 | 236/386 |
| gate off (neighborhood names, distances, exact ETAs as-is) | 50 | 100.0% · 100.0% | 49/50 (98.0%) | 36/50 (72.0%) | 244 | 0/386 |

¹ Every published offer/counter reason is a stock status phrase. This column counts messages where the agent tried to say something else, which was replaced. In the default row the mock agent already writes the stock phrase.

## A hindsight bound that does not depend on the attacker

A low hit rate from one attacker could just mean that attacker is weak. We therefore also measure a ceiling that holds for any attacker on these scenarios. Identical logs cannot be told apart by anyone, LLMs included. Group the scenarios by identical log and assume the attacker always picks the most common true answer in each group: that is the best hit rate any attacker could achieve on these scenarios, at district level.

- Gate on: the 50 scenarios produce only 5 distinct logs (they differ only in states, ETA ranges and the negotiation outcome). The ceiling is home 22.0% · school 24.0%. What remains comes from the coarse status itself ("on the way, within 20 min"), which the family chose to share; the gate cannot remove it.
- Gate on with an agent that secretly knows its location: the number of distinct logs and the bound are identical to gate on. Public logs also drop internal flags (fallback, filtered), so nobody outside can tell what an agent tried to say.
- Gate off: all 50 logs are different, so the bound is 100.0%.

## How to read it

- **Gate off**: agents say the neighborhood they are passing through, the distance home and the exact minutes left. Neighborhood names are mixed in several forms (full name, stem, spaced out, zero-width characters, station name). The attacker narrows down the home district from "near X" mentions and from "passing through X + distance (or ETA × car speed)".
- **Gate on**: WhereCtx refuses location details (home_zone_refused inside the home zone). Agents' own words are never published: every offer/counter reason is a status template, and ETAs are only ever shown as ranges ("within 10 min"). Task labels containing locations are rejected by the inbox, so in this condition the requester resubmits a label with the location removed.
- **Gate on, agent knows its location**: the agent tries to talk exactly like in gate off, but none of that text is published. No free text is published, so no word list is needed.
- With no clues the rule-based attacker always guesses the most central district, so its gate-on hit rate (6%) is just the share of scenarios where that district happens to be the answer, close to chance (4%).
- The school leaks in gate off when the requester writes the school's neighborhood into the label; otherwise the attacker guesses "school is near home".

## Limitations

- The gate-off phrasing and the rule-based attacker were written by the same team. The gate-off numbers show how much this kind of chatter can reveal; they do not model every way an LLM might leak. That is why the ceiling is the headline number. With a key, `npm run leak` re-measures with Muse as both negotiator and attacker.
- The family screen (map) shows exact ETA minutes per the Presence contract; negotiation logs and agent messages carry only ranges.
- Candidates are the 25 Seoul districts; we did not measure finer-grained (neighborhood-level) guesses.

## Reproduce

```bash
npm run leak
```

With `MODEL_API_KEY` set, both the negotiating agents and the attacker use Muse. Without it, mock runs reproduce the same numbers (deterministic).
