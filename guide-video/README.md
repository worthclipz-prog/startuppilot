# YouTube Niche Filter: install & usage guide video

`youtube-niche-filter-guide.mp4` is a narrated, 1920×1080 (landscape) walkthrough, about 4½ minutes long,
of the **YouTube Niche Filter** Chrome extension (`youtube-ai-assistant.zip`). It covers:

1. **Add the extension to Chrome**: download the zip from Google Drive, *Extract All*, open the inner
   `youtube-ai-assistant` folder (the one with `manifest.json`), go to ⋮ → Extensions → Manage Extensions
   (or `chrome://extensions`), turn on **Developer mode**, click **Load unpacked**, and pick the folder.
2. **Open YouTube**: a new tab, then `youtube.com`, staying on the home feed.
3. **Select the extension**: the puzzle-piece menu, then pin *YouTube Niche Filter*.
4. **Open the extension**: click the toolbar icon and check that *Tab: YouTube ready* and *Automation: Armed* are shown.
5. **Choose a category**: pick a built-in one, or use *Add manually…* (e.g. "Cooking" + keywords), then *Save Setup*.
6. **Start it**: click **Scan**. If the popup says *"Please refresh the YouTube page first"*, reload the
   tab (reload button or F5), reopen the extension and click **Scan** again. The video also shows the
   activity log, the timers and the **STOP** button.

Every step has a voice-over (Kokoro TTS, voice `af_heart`), on-screen captions with the UI labels
highlighted, a cursor with click effects, zoom-ins, and highlight rings.

## What is real and what is recreated

| On screen | Source |
| --- | --- |
| `chrome://extensions` (Developer mode off/on, *Load unpacked*, the loaded extension card) | Real Chromium screenshots, taken with the actual extension loaded (`tools/prepare.mjs`) |
| The extension popup, its dropdown, *Add Custom Category* dialog, status messages, timers, activity log | The extension's **own** `popup.html/css/js`, running in the video on a stubbed `chrome.*` API (`stage/chrome-stub.js`). The refresh warning, the custom-category flow and *Save Setup* are the real code paths. The scan messages mirror `scripts/content.js` |
| Chrome window, menus, Google Drive, Windows Explorer, folder picker, YouTube | HTML mock-ups (`stage/ui.js`). The recording sandbox has no Windows desktop or YouTube access, and the native file dialog can't be screenshotted |

Two things viewers will see that come from the current zip:

* Chrome shows a grey **"Y"** placeholder instead of the extension's logo. The files in `icons/` are JPEG images
  saved with a `.png` name, and Chrome won't decode them. Re-saving them as real PNGs fixes this.
* Windows' *Extract All* creates `youtube-ai-assistant\youtube-ai-assistant\…`, so the guide tells viewers to select
  the **inner** folder (the one that contains `manifest.json`).

## Rebuilding the video

Requirements: Node 18+, Playwright with Chromium, Python 3 with `kokoro-onnx` and `soundfile`, and `ffmpeg`.

```bash
cd guide-video
npm install && npx playwright install chromium   # or point PLAYWRIGHT_MODULE at an existing install
pip install kokoro-onnx soundfile

# 1. assets: real popup + fonts + real chrome://extensions captures
unzip youtube-ai-assistant.zip -d /tmp/ext
node tools/prepare.mjs --ext /tmp/ext/youtube-ai-assistant      # folder that has manifest.json

# 2. voice-over (model files from github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
python3 tools/tts.py --models /path/to/kokoro-models            # kokoro-v1.0.onnx + voices-v1.0.bin

# 3. preview frames, then the full video
node tools/render.mjs --stills 20,90,240                        # PNGs in build/stills/
node tools/render.mjs                                           # -> youtube-niche-filter-guide.mp4
```

To change the words, edit `narration/lines.json`. `text` is the caption (`**…**` marks a highlighted UI label)
and `say` is what the voice reads. Re-run `tts.py` (with `--only <id>` for a single line) and then render.
The timing follows the new clip lengths automatically.

To change what happens on screen, edit `stage/scenes.js`. Each `say()` block plays one line, and actions are
anchored to its spoken words with `s.w('word')`.

## Files

* `stage/`: the deterministic "screen" (`stage.html`, `stage.css`, `ui.js` mock-ups, `engine.js` timeline,
  cursor, camera and captions, `scenes.js` storyboard, `chrome-stub.js`)
* `tools/prepare.mjs`: builds `build/` (popup copy, fonts, chrome://extensions shots)
* `tools/tts.py`: generates the narration clips
* `tools/render.mjs`: renders frames on a virtual clock and encodes H.264/AAC with ffmpeg
  (`tools/mix_audio.py` lays the clips on the timeline)
