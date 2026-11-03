// 녹음 목록 만들기: npm run video:cues → video-out/voice/CUES.md
// 문장 하나를 파일 하나로 녹음해 같은 폴더에 넣고 npm run video를 다시 돌리면 그 목소리로 합쳐진다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEGMENTS, captionText } from './narration.js';
import { VOICE_DIR, recordingFor, recordingName } from './voice.js';

mkdirSync(VOICE_DIR, { recursive: true });
let done = 0;
const rows = SEGMENTS.flatMap((seg) =>
  seg.lines.map((line, i) => {
    const have = recordingFor(seg.id, i);
    if (have) done += 1;
    return `| ${have ? '✅' : '⬜'} | \`${recordingName(seg.id, i)}.m4a\` | ${captionText(line.text)} |`;
  }),
);
const doc = `# Narration cues

Record one file per line and save it in this folder under the name shown (m4a, wav, mp3 or aiff all work).
Then run \`npm run video\`. Lines without a recording fall back to the macOS voice.

- Read the text as written. The captions show this exact text.
- Leading and trailing silence is trimmed and loudness is evened out automatically.
- The screen waits for each recording, so pace is up to you, but the whole video must stay under 3 minutes.

| | File | Line |
| --- | --- | --- |
${rows.join('\n')}
`;
writeFileSync(join(VOICE_DIR, 'CUES.md'), doc);
console.log(`${join(VOICE_DIR, 'CUES.md')} · 녹음 ${done}/${rows.length}`);
