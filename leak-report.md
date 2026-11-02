# WRU leak test report

We give an adversary nothing but the negotiation log and ask it to guess which of Seoul's 25 districts (gu) the family's **home** and the child's **school** are in.

- Trials: 50 per condition (scenario seeds 1–50; home, school and routes differ per seed)
- Adversary: rule-based mock (scores districts from neighbourhood names, remaining distance and ETA found in the log text; it never sees the scenario answers)
- Negotiating agents: deterministic mock Muse
- Chance: 1/25 = 4.0%

| Condition | Distinct logs | Upper bound for any adversary (home · school) | Rule-based adversary: home | Rule-based adversary: school | Messages/labels with location hints | Messages rewritten to templates |
| --- | --- | --- | --- | --- | --- | --- |
| **gate on** (detail refused · status templates · ETA ranges) | 5 | 22.0% · 24.0% | 3/50 (6.0%) | 0/50 (0.0%) | 0 | 0/386 |
| gate on, agent secretly knows its location | 5 | 22.0% · 24.0% | 3/50 (6.0%) | 0/50 (0.0%) | 0 | 236/386 |
| gate off (neighbourhood names, distances, exact ETAs as-is) | 50 | 100.0% · 100.0% | 49/50 (98.0%) | 36/50 (72.0%) | 244 | 0/386 |

## An upper bound that does not depend on the adversary

A low hit rate from one adversary could just mean that adversary is weak. So we also measure a bound that holds for any adversary. Identical logs cannot be told apart by anyone, LLMs included. Group the scenarios by identical log and assume the adversary always picks the most common true answer in each group: that is the best hit rate any adversary could achieve on these scenarios.

- Gate on: the 50 scenarios produce only 5 distinct logs (they differ only in states, ETA ranges and the negotiation outcome). The bound is home 22.0% · school 24.0% — and that is optimistic, since it picks answers knowing them in advance. What remains comes from the coarse status itself ("on the way, within 20 min"), which the family chose to share; the gate cannot remove it.
- Gate on with an agent that secretly knows its location: the number of distinct logs and the bound are identical to gate on. Public logs also drop internal flags (fallback, filtered), so nobody outside can tell what an agent tried to say.
- Gate off: all 50 logs are different, so the bound is 100.0%.

## How to read it

- **Gate off**: agents say the neighbourhood they are passing through, the distance home and the exact minutes left. Neighbourhood names are mixed in several forms (full name, stem, spaced out, zero-width characters, station name). The adversary narrows down the home district from "near X" mentions and from "passing through X + distance (or ETA × car speed)".
- **Gate on**: WhereCtx refuses location detail (home_zone_refused inside the home zone), and WRU never publishes the agent's free text: every offer/counter reason is rewritten from a status template, and ETAs leave only as ranges ("within 10 min"). Task labels containing locations are rejected by the inbox, so in this condition the requester resubmits a label with the location removed.
- **Gate on, agent knows its location**: the agent tries to talk exactly like in gate off, but none of that text is published. The protection comes from the structure ("free text never leaves"), not from a word list.
- With no clues the rule-based adversary always guesses the most central district, so its gate-on hit rate is the share of scenarios where that district happens to be the answer — the same as chance.
- The school leaks in gate off when the requester writes the school's neighbourhood into the label; otherwise the adversary guesses "school is near home".

## Limitations

- The gate-off phrasing and the rule-based adversary were written by the same team. The gate-off numbers are an example of "how far such talk narrows things down", not a model of every way an LLM might leak. That is why the adversary-independent bound is the headline number. With a key, `npm run leak` re-measures with Muse as both negotiator and adversary.
- The family screen (map) shows exact ETA minutes per the Presence contract; negotiation logs and agent messages carry only ranges.
- Candidates are the 25 Seoul districts; we did not measure finer-grained (neighbourhood-level) guesses.

## Reproduce

```bash
npm run leak
```

With `MODEL_API_KEY` set, both the negotiating agents and the adversary use Muse. Without it, mock runs reproduce the same numbers (deterministic).
