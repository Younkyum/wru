// 3분 데모 영상 초안 만들기: npm run video
// 1) 내레이션(macOS say)을 구간별로 만들고 길이를 잰다
// 2) 빌드된 앱을 띄우고 헤드리스 Chromium으로 /demo?video=1을 녹화하며 데모 모드를 자동 진행한다
// 3) ffmpeg로 화면 + 내레이션을 합쳐 video-out/wru-demo.mp4, 자막 video-out/wru-demo.srt를 만든다
// 결과물은 git에 넣지 않는다 (.gitignore: video-out/)

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { chromium } from 'playwright';
import { SEGMENTS, captionText } from './narration.js';

const OUT = resolve('video-out');
const TMP = join(OUT, 'tmp');
const PORT = Number(process.env.WRU_VIDEO_PORT ?? 8790);
const VOICE = process.env.WRU_VIDEO_VOICE ?? 'Yuna';
const RATE = process.env.WRU_VIDEO_RATE ?? '188';
const MAX_SECONDS = 180;
const W = 1440;
const H = 900;

const ffmpeg = ffmpegInstaller.path;
const ffprobe = ffprobeInstaller.path;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function duration(file: string): number {
  return Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

/** 문장마다 따로 녹음해서 길이를 안다 (자막을 문장 단위로 맞추기 위해) */
function narrate() {
  return SEGMENTS.map((seg) =>
    seg.lines.map((line, i) => {
      const aiff = join(TMP, `${seg.id}-${i}.aiff`);
      const wav = join(TMP, `${seg.id}-${i}.wav`);
      execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, line]);
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '1', wav]);
      return { line, wav, seconds: duration(wav) };
    }),
  );
}

async function waitForServer(url: string) {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // 아직 안 떴다
    }
    await sleep(500);
  }
  throw new Error('서버가 뜨지 않았어요');
}

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  console.log('1/4 내레이션 만들기');
  const voice = narrate();
  const GAP = 0.35; // 문장 사이 쉼

  console.log('2/4 앱 빌드 · 서버 시작');
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { stdio: 'inherit' });
  const server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'production', WRU_API_PORT: String(PORT), WRU_FAMILY_CONFIG: '' , MODEL_API_KEY: '' },
    stdio: 'ignore',
  });
  try {
    await waitForServer(`http://localhost:${PORT}/api/state`);

    console.log('3/4 녹화');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      locale: 'ko-KR',
      recordVideo: { dir: TMP, size: { width: W, height: H } },
    });
    const page = await context.newPage();
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/demo?video=1`);
    await page.waitForFunction(() => !!(window as unknown as { __wru?: unknown }).__wru);
    await page.evaluate(() => document.fonts.ready);
    await sleep(800);
    const start = (Date.now() - t0) / 1000; // 영상에서 잘라낼 앞부분 (로딩)

    const wru = <T>(fn: string, arg?: unknown) =>
      page.evaluate(([f, a]) => (window as any).__wru[f as string](a), [fn, arg] as const) as Promise<T>;
    const busy = () => page.evaluate(() => (window as any).__wru.busy as boolean);

    const clips: { wav: string; at: number }[] = [];
    const subs: { from: number; to: number; text: string }[] = [];
    for (const [si, seg] of SEGMENTS.entries()) {
      await wru('scene', seg.scene ?? null);
      if (seg.step !== undefined) {
        await (seg.step === 0 ? wru('start') : wru('next'));
        await page.waitForFunction((s) => (window as any).__wru.step === s, seg.step);
      }
      await sleep(250);
      for (const v of voice[si]!) {
        const at = (Date.now() - t0) / 1000 - start;
        clips.push({ wav: v.wav, at });
        subs.push({ from: at, to: at + v.seconds, text: captionText(v.line) });
        await wru('caption', captionText(v.line));
        await sleep((v.seconds + GAP) * 1000);
      }
      // 협상 메시지가 다 나올 때까지 기다린다
      while (await busy()) await sleep(200);
      await sleep((seg.hold ?? 0.3) * 1000);
      await wru('caption', null);
    }
    const end = (Date.now() - t0) / 1000 - start;
    await context.close();
    await browser.close();

    const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
    if (!webm) throw new Error('녹화 파일이 없어요');

    console.log('4/4 합치기');
    const out = join(OUT, 'wru-demo.mp4');
    const inputs = ['-ss', start.toFixed(2), '-i', join(TMP, webm), ...clips.flatMap((c) => ['-i', c.wav])];
    const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`);
    const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad[aout]`;
    execFileSync(ffmpeg, [
      '-y', '-loglevel', 'error', ...inputs,
      '-filter_complex', [...delays, mix].join(';'),
      '-map', '0:v', '-map', '[aout]', '-t', end.toFixed(2),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
    ]);
    writeFileSync(
      join(OUT, 'wru-demo.srt'),
      subs.map((s, i) => `${i + 1}\n${srtTime(s.from)} --> ${srtTime(s.to)}\n${s.text}\n`).join('\n'),
    );
    const total = duration(out);
    const marks = SEGMENTS.map((seg, i) => `${seg.id} ${subs[voice.slice(0, i).reduce((n, v) => n + v.length, 0)]!.from.toFixed(1)}s`);
    console.log(`완료: ${out} (${total.toFixed(1)}초)`);
    console.log(`구간 시작: ${marks.join(' · ')}`);
    if (total > MAX_SECONDS) {
      console.error(`3분(${MAX_SECONDS}초)을 넘었어요: ${total.toFixed(1)}초`);
      process.exitCode = 1;
    }
    if (!process.env.WRU_VIDEO_KEEP_TMP) rmSync(TMP, { recursive: true, force: true });
  } finally {
    server.kill();
  }
}

if (!existsSync('package.json')) throw new Error('레포 루트에서 실행하세요');
await main();
