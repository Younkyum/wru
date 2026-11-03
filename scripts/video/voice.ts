// 내 목소리로 내레이션: 문장마다 파일 하나. npm run video:cues가 녹음 목록을 만든다.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const VOICE_DIR = process.env.WRU_VOICE_DIR ?? join('video-out', 'voice');
const EXTS = ['m4a', 'wav', 'mp3', 'aiff', 'aif'];

export const recordingName = (segId: string, i: number) => `${segId}-${i}`;

export function recordingFor(segId: string, i: number): string | null {
  for (const ext of EXTS) {
    const file = join(VOICE_DIR, `${recordingName(segId, i)}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}
