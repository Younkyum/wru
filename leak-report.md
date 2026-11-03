# WRU leak test report

We give an attacker nothing but the negotiation log and ask it to guess which of Seoul's 25 districts (gu) the family's **home** and the child's **school** are in.

- Trials: 50 per condition (scenario seeds 1 to 50; home, school and routes differ per seed)
- Attacker: Muse (Meta Model API)
- Negotiating agents: Muse (Meta Model API)
- Chance: 1/25 = 4.0%

| Condition | Distinct logs | Best-case attacker (home, school) | Muse attacker: home | Muse attacker: school | Messages/labels with location hints | Rewritten messages¹ |
| --- | --- | --- | --- | --- | --- | --- |
| **gate on** (detail refused · status templates · ETA ranges) | 9 | 28.0%, 32.0% | 2/50 (4.0%) | 2/50 (4.0%) | 0 | 150/307 |
| gate on, agent secretly knows its location | 10 | 32.0%, 34.0% | 3/50 (6.0%) | 5/50 (10.0%) | 0 | 263/386 |
| gate off (neighborhood names, distances, exact ETAs as-is) | 50 | 100.0%, 100.0% | 50/50 (100.0%) | 35/50 (70.0%) | 193 | 0/318 |

¹ Every published offer/counter reason is a stock status phrase. This column counts messages where the agent tried to say something else and was replaced, plus turns where the model output failed validation and the template decision was used.

## A best-case attacker that does not depend on the attacker we wrote

A low hit rate from one attacker could just mean that attacker is weak. We therefore also measure a best-case attacker that no real attacker can beat on these scenarios. Identical logs cannot be told apart by anyone, LLMs included. Group the scenarios by identical log and assume the attacker always picks the most common true answer in each group: that is the best hit rate any attacker could achieve on these scenarios, at district level.

- Gate on: the 50 scenarios produce only 9 distinct logs (they differ only in states, ETA ranges and the negotiation outcome; real Muse varies its choices of subtask, fit and refusals more than the mock, so there are more distinct logs than in the mock run). The best-case attacker reaches home 28.0%, school 32.0%. What remains comes from the coarse status itself ("on the way, within 20 min"), which the family chose to share; the gate cannot remove it.
- Gate on with an agent that secretly knows its location: 10 distinct logs, best-case attacker home 32.0%, school 34.0% (gate on: 9 logs, 28.0%, 32.0%). None of the agent's location text reaches the log, but its choices (which subtask, how good a fit, whether to refuse) can still change with what it knows, and that structure is public. Public logs also drop internal flags (fallback, filtered), so nobody outside can tell what an agent tried to say.
- Gate off: all 50 logs are different, so the best-case attacker reaches 100.0%.

## How to read it

- **Gate off**: agents say the neighborhood they are passing through, the distance home and the exact minutes left. Neighborhood names are mixed in several forms (full name, stem, spaced out, zero-width characters, station name). The attacker narrows down the home district from "near X" mentions and from "passing through X + distance (or ETA × car speed)".
- **Gate on**: WhereCtx refuses location details (home_zone_refused inside the home zone). Agents' own words are never published: every offer/counter reason is a status template, and ETAs are only ever shown as ranges ("within 10 min"). Task labels containing locations are rejected by the inbox, so in this condition the requester resubmits a label with the location removed.
- **Gate on, agent knows its location**: the agent tries to talk exactly like in gate off, but none of that text is published.
- The Muse attacker reads the same public log and must name one district for home and one for school (a `json_schema` enum of the 25 districts). In gate on it scores 4.0% / 4.0%, against chance 4.0%.
- The school leaks in gate off when the requester writes the school's neighborhood into the label; otherwise the attacker guesses "school is near home".

## Limitations

- Real Muse is not deterministic, so a rerun gives somewhat different numbers. With 50 scenarios, a few percentage points are within noise. The best-case attacker is computed in hindsight over these 50 logs, so it is an upper bound, not a typical attacker.
- The family screen (map) shows exact ETA minutes per the Presence contract; negotiation logs and agent messages carry only ranges.
- Candidates are the 25 Seoul districts; we did not measure finer-grained (neighborhood-level) guesses.

## Reproduce

```bash
npm run leak
```

With `MODEL_API_KEY` set, both the negotiating agents and the attacker use Muse (this report: 150 negotiations + 150 attacker calls on Muse Spark). Without it, mock runs are deterministic.
