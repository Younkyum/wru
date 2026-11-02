#!/usr/bin/env python3
"""비판 라운드용 결과물 묶기: video-out/round-N/ 에 자막 문장마다 프레임 1장, 자막, 대본, 화면 문구를 모은다.
사용: python3 scripts/video/pack-round.py N"""
import os, re, shutil, subprocess, sys

n = sys.argv[1]
out = f"video-out/round-{n}"
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
ffmpeg = "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg"
srt = open("video-out/wru-demo.srt", encoding="utf8").read()
cues = []
for block in srt.strip().split("\n\n"):
    lines = block.splitlines()
    a, b = lines[1].split(" --> ")
    sec = lambda t: (lambda h, m, s: int(h) * 3600 + int(m) * 60 + float(s.replace(",", ".")))(*t.split(":"))
    cues.append((sec(a), sec(b), " ".join(lines[2:])))
for i, (a, b, text) in enumerate(cues, 1):
    t = a + (b - a) * 0.7
    subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", "video-out/wru-demo.mp4", "-frames:v", "1", "-vf", "scale=1280:-1", f"{out}/{i:02d}_{t:05.1f}s.jpg"], check=True)
dur = subprocess.run(["node_modules/@ffprobe-installer/darwin-arm64/ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "video-out/wru-demo.mp4"], capture_output=True, text=True).stdout.strip()
shutil.copy("video-out/wru-demo.srt", f"{out}/subtitles.srt")
shutil.copy("docs/VIDEO_SCRIPT.md", f"{out}/VIDEO_SCRIPT.md")
shutil.copy("docs/COPY.md", f"{out}/COPY.md")
open(f"{out}/README.txt", "w", encoding="utf8").write(
    f"WRU demo video draft\nLength: {float(dur):.1f} s (recorded at 1440x900, frames scaled to 1280px)\n"
    f"Frames: one per subtitle sentence, named order_videoTime. Subtitle text is in subtitles.srt\n"
    f"Source video: {os.path.abspath('video-out/wru-demo.mp4')}\n")
print(out, len(cues), "frames", dur)
