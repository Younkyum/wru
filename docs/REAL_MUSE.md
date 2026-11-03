# Running WRU on real Muse Spark

The real Muse path is already in the code. It runs whenever `MODEL_API_KEY` is set, and falls back to the deterministic mock when it isn't.

## What the real path does

- **Model.** `muse-spark-1.3` (Standard), on Chat Completions at `https://api.meta.ai/v1/chat/completions`. Override it with `MUSE_MODEL`.
- **Tool calling.** Each agent's Muse gets two tools, `get_presence` and `get_eta`. Its prompt contains no status; it has to call a tool to learn its own. The tools are bound to that agent's WRU token. If the model asks about anyone else, the gateway's `403 not_your_presence` comes back as the tool result. Tool results carry only the coarse state and an ETA range.
- **Structured output.** The final answer must match a strict `json_schema` with one offer / counter / commit / refuse / pass object; unused fields are `null`. WRU still runs its own checks (schema, subtask ownership, location words) and rewrites reasons to templates. Anything that fails falls back to the same template the mock uses.
- **Limits.** Each turn stops after 3 model round trips. Each process has a call cap (`MUSE_MAX_CALLS`) and an estimated-cost cap (`MUSE_MAX_USD`). `reasoning_effort` defaults to `low` (`MUSE_REASONING_EFFORT`).

## After the key is in `.env`

```bash
npm run muse:real
```

This runs four steps and stops at the first failure.

1. **`npm run muse:smoke`** checks the setup with at most 30 calls (about $0.05):
   - `GET /models` lists the model
   - one tool-calling turn reads Dad's own status
   - asking for Mom's status with Dad's token returns 403
   - one full hero negotiation completes

   It prints only a summary: no key, no raw responses. With no key it says what is missing and exits with code 2.
2. **`npm run leak`** runs the leak test on real Muse:
   - 50 scenarios × 3 conditions
   - the attacker is Muse too, asked for a district through a `json_schema` enum
   - 6 scenarios run in parallel
   - caps are 3,000 calls and $15
   - at the cost measured in the smoke run, a full run comes to about 1,500 calls, roughly $5, and 15 to 20 minutes

   The run rewrites `samples/leak-report.json` and `leak-report.md`.
3. **Compare** the mock numbers with the real-Muse numbers and list the copy that has to change.
4. **`npm test`** fails if the README, SUBMISSION, COPY or VIDEO_SCRIPT numbers no longer match the new report.

## Then update the copy and re-render

1. In `scripts/video/narration.ts`:
   - drop the line "In this recording, a mock … stands in for Muse Spark"
   - update the leak percentages
   - update the outro ("Add a Meta Model API key …")
2. In `src/web/DemoPage.tsx`, update the mock wording in the Muse panel and the outro card.
3. Update `README.md` (Limitations), `docs/SUBMISSION.md`, `docs/COPY.md` and `docs/VIDEO_SCRIPT.md`.
4. Run `npm test`, then `npm run video`.

The video records the negotiation through the running server. With a key set, the agents in the recording are real Muse, so the messages can differ from one run to the next. Check the hero result before re-rendering.

## Sources

- Models (muse-spark-1.3, "Recommended for new work"): https://dev.meta.ai/docs/models
- Chat Completions parameters (`reasoning_effort`, `max_completion_tokens`, temperature): https://dev.meta.ai/docs/protocols/chat-completions
- Tool calling (`tools`, `tool_calls`, `role: "tool"` + `tool_call_id`, `tool_choice: "auto"` only): https://dev.meta.ai/docs/tool-calling
- Structured output (`response_format.json_schema`, `strict`): https://dev.meta.ai/docs/structured-output
- Pricing (muse-spark-1.3 Standard: $1.25 input and $4.25 output per million tokens): https://dev.meta.ai/docs/pricing-rate-limits
