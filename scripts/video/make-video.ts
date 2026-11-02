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
import { renderScriptDoc } from './script-doc.js';

const OUT = resolve('video-out');
const TMP = join(OUT, 'tmp');
const PORT = Number(process.env.WRU_VIDEO_PORT ?? 8790);
const VOICE = process.env.WRU_VIDEO_VOICE ?? 'Samantha';
const RATE = process.env.WRU_VIDEO_RATE ?? '182';
const MAX_SECONDS = 180;
// 1920×1080으로 녹화하고, 영상 모드(?video=1)는 CSS zoom 1.4로 그려 글자를 키운다 (약 1371×771 레이아웃)
const W = 1920;
const H = 1080;

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

/** TTS가 잘못 읽는 이름은 소리 나는 대로 바꿔 읽힌다 (자막은 원래 표기) */
function spoken(line: string): string {
  return line.replace(/WhereCtx/g, 'Where Context').replace(/\bWRU\b/g, 'W R U').replace(/\u2011/g, '-');
}

/** 문장마다 따로 녹음해서 길이를 안다 (자막을 문장 단위로 맞추기 위해) */
function narrate() {
  return SEGMENTS.map((seg) =>
    seg.lines.map(({ text: line }, i) => {
      const aiff = join(TMP, `${seg.id}-${i}.aiff`);
      const wav = join(TMP, `${seg.id}-${i}.wav`);
      execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, spoken(line)]);
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
      locale: 'en-US',
      recordVideo: { dir: TMP, size: { width: W, height: H } },
    });
    const page = await context.newPage();
    const t0 = Date.now();
    // 협상 메시지는 문장마다 정한 수만큼 스크립트가 직접 펼친다
    await page.goto(`http://localhost:${PORT}/demo?video=1&reveal=manual`);
    await page.mouse.move(-10, -10);
    await page.waitForFunction(() => !!(window as unknown as { __wru?: unknown }).__wru);
    await page.evaluate(() => document.fonts.ready);
    await sleep(800);
    const start = (Date.now() - t0) / 1000; // 영상에서 잘라낼 앞부분 (로딩)

    const wru = <T>(fn: string, ...args: unknown[]) =>
      page.evaluate(([f, a]) => (window as any).__wru[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
    const busy = () => page.evaluate(() => (window as any).__wru.busy as boolean);

    const clips: { wav: string; at: number }[] = [];
    const subs: { from: number; to: number; text: string }[] = [];
    await wru('reset');
    for (const [si, seg] of SEGMENTS.entries()) {
      await wru('scene', seg.scene ?? null);
      await wru('chapter', seg.chapter ?? null);
      // 탭을 바꿀 때는 창 전체로 물러났다가, 누른 뒤에 패널로 다가간다
      await wru('camera', null);
      await sleep(250);
      for (const [li, v] of voice[si]!.entries()) {
        const line = seg.lines[li]!;
        if (line.reveal !== undefined) await wru('revealTo', line.reveal);
        await wru('highlight', line.hl ?? null, !line.click);
        const at = (Date.now() - t0) / 1000 - start;
        clips.push({ wav: v.wav, at });
        subs.push({ from: at, to: at + v.seconds, text: captionText(v.line) });
        await wru('caption', captionText(v.line));
        // 문장을 읽는 동안 커서가 버튼으로 가서 실제로 누른다
        const click = (line.click ? wru('clickTarget', line.click) : Promise.resolve()).then(() =>
          seg.camera && li === 0 ? sleep(300).then(() => wru('camera', seg.camera)) : undefined,
        );
        await Promise.all([click, sleep((v.seconds + GAP) * 1000)]);
        if (line.after) await wru(line.after);
      }
      await wru('highlight', null);
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
    const starts = Object.fromEntries(
      SEGMENTS.map((seg, i) => [seg.id, subs[voice.slice(0, i).reduce((n, v) => n + v.length, 0)]!.from]),
    );
    writeFileSync('docs/VIDEO_SCRIPT.md', renderScriptDoc(starts, total));
    console.log(`완료: ${out} (${total.toFixed(1)}초)`);
    console.log(`구간 시작: ${SEGMENTS.map((s) => `${s.id} ${starts[s.id]!.toFixed(1)}s`).join(' · ')}`);
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
