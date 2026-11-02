// docs/VIDEO_SCRIPT.md 만들기. 내레이션 원본(narration.ts)과 마지막 렌더의 구간 시작 시각으로 쓴다.

import { SEGMENTS } from './narration.js';

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function renderScriptDoc(starts: Record<string, number>, total: number): string {
  const rows = SEGMENTS.map((s) => `| ${mmss(starts[s.id] ?? 0)} | ${s.title} | ${s.screen} | ${s.rubric} |`);
  const body = SEGMENTS.map((s) => [`### ${mmss(starts[s.id] ?? 0)} ${s.title}`, '', ...s.lines.map((l) => `- ${l.text}`), ''].join('\n'));
  return `# 데모 영상 대본 (약 ${mmss(total)})

\`npm run video\`가 이 대본으로 영상 초안을 만들고, 이 문서도 다시 씁니다. 순서는 이렇습니다.

1. 문장마다 macOS \`say\`(Yuna)로 내레이션을 만듭니다.
2. 헤드리스 Chromium으로 \`/demo?video=1\`을 녹화하면서 데모 모드를 자동으로 넘깁니다. 협상 메시지는 내레이션에 맞춰 하나씩 나오고, 승인 버튼도 내레이션 중에 누릅니다.
3. ffmpeg로 합쳐 \`video-out/wru-demo.mp4\`와 자막 \`video-out/wru-demo.srt\`를 만듭니다.

결과물은 git에 넣지 않습니다. 내레이션 원본은 \`scripts/video/narration.ts\`입니다. 최종 목소리를 다시 녹음할 때는 아래 시작 시각에 맞춰 읽으면 됩니다(초안 기준, 문장 사이 0.35초 쉼).

| 시작 | 컷 | 화면 | 심사 항목 |
| --- | --- | --- | --- |
${rows.join('\n')}

## 내레이션

${body.join('\n')}
## 다시 만들 때

- \`npm run video\`로 초안을 다시 만들면 \`video-out/\`에 mp4와 srt가 생기고 이 문서의 시각도 갱신됩니다. 3분을 넘으면 실패로 끝납니다.
- 직접 녹음할 때는 \`WRU_VIDEO_VOICE\`, \`WRU_VIDEO_RATE\`로 초안 목소리 · 속도를 바꾸거나, 초안 mp4의 오디오를 빼고 새 녹음을 얹습니다.
- Meta Model API 키를 넣고 \`npm run leak\`을 다시 돌렸다면 누수 숫자를 \`scripts/video/narration.ts\`에서 맞춥니다.
- 실제 Muse로 다시 찍으면 mock 고지 문장(5컷 · 클로징)을 바꿉니다.
`;
}
