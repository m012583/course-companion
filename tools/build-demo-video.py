"""Build an explicitly labelled screenshot walkthrough, not a live AI recording."""
import json
import pathlib
import subprocess
import wave
import imageio_ffmpeg

root = pathlib.Path(__file__).resolve().parents[1]
work = root / "test-results" / "demo"
scenes = json.loads((root / "docs" / "demo-narration.json").read_text(encoding="utf-8"))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
for i, scene in enumerate(scenes, 1):
    with wave.open(str(work / f"{i}.wav")) as sound:
        duration = sound.getnframes() / sound.getframerate()
    # Fit each narration to 42 seconds, followed by three seconds to read the page.
    rate = duration / 42
    filters = []
    while rate < .5:
        filters.append("atempo=0.5")
        rate *= 2
    while rate > 2:
        filters.append("atempo=2")
        rate /= 2
    filters += [f"atempo={rate}", "apad"]
    (work / f"{i}.txt").write_text(scene["title"] + "  ·  操作截图讲解初稿 / 合成配音 / 演示数据", encoding="utf-8")
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "12", "-i", f"{i}.png", "-i", f"{i}.wav", "-vf", f"drawbox=x=0:y=970:w=1920:h=110:color=black@0.85:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':textfile='{i}.txt':fontsize=28:fontcolor=white:x=40:y=985:line_spacing=10", "-af", ",".join(filters), "-t", "45", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", f"{i}.mp4"], cwd=work, check=True)
    print(f"Rendered {i}/8", flush=True)
(work / "concat.txt").write_text("\n".join(f"file '{i}.mp4'" for i in range(1, 9)), encoding="utf-8")
output = root.parent / "课伴-6分钟演示初稿.mp4"
subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", str(output)], cwd=work, check=True)
print(output, flush=True)
