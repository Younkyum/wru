// docs/VIDEO_SCRIPT.md 만들기. 내레이션 원본(narration.ts)과 마지막 렌더의 구간 시작 시각으로 쓴다.

import { SEGMENTS } from './narration.js';

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function renderScriptDoc(starts: Record<string, number>, total: number): string {
  const rows = SEGMENTS.map((s) => `| ${mmss(starts[s.id] ?? 0)} | ${s.title} | ${s.screen} | ${s.rubric} |`);
  const body = SEGMENTS.map((s) => [`### ${mmss(starts[s.id] ?? 0)} ${s.title}`, '', ...s.lines.map((l) => `- ${l.text}`), ''].join('\n'));
  return `# Demo video script (about ${mmss(total)})

\`npm run video\` builds the draft video from this script and rewrites this document. It works in three steps:

1. Each sentence is voiced with macOS \`say\` (Samantha).
2. Headless Chromium records \`/demo?video=1\` while the script drives demo mode. Negotiation messages appear in step with the narration, the approval button is pressed mid-sentence, and the thing each sentence talks about is highlighted on screen.
3. ffmpeg combines everything into \`video-out/wru-demo.mp4\` and subtitles \`video-out/wru-demo.srt\`.

The outputs are not committed. The narration source is \`scripts/video/narration.ts\`. To record a final voice-over, read each section at the start time below (draft timing, 0.35 s pause between sentences).

| Start | Cut | Screen | Rubric |
| --- | --- | --- | --- |
${rows.join('\n')}

## Narration

${body.join('\n')}
## Re-recording

- \`npm run video\` regenerates the draft in \`video-out/\` and refreshes the start times here. It fails if the video runs over 3 minutes.
- For your own voice, run \`npm run video:cues\`. It writes \`video-out/voice/CUES.md\`, which lists one file name per line. Record each line into that folder and run \`npm run video\` again. The screen waits for each recording, so timing follows your pace. Lines you skip use the macOS voice (\`WRU_VIDEO_VOICE\` / \`WRU_VIDEO_RATE\`).
- If you re-run \`npm run leak\` with a Meta Model API key, update the leak numbers in \`scripts/video/narration.ts\`.
- If you re-record with the real Muse, change the mock disclosure sentences (cut 4 and the closing card).
`;
}
