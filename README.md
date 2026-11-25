# FTC Judge Prep

Desktop app (Electron + React + TypeScript) for practicing FIRST Tech Challenge judging interviews.
Practice tool only. It is not an official FIRST judging tool and does not predict judging results.

## Install
Download the latest installer from the [Releases page](https://github.com/DigitalPineapple/ftc-judge-prep/releases/latest).
The builds are unsigned, so your OS will show a warning the first time.

**macOS (Apple Silicon)**
1. Download `ftc-judge-prep-<version>.dmg`, open it, and drag the app to Applications.
2. Don't double-click it the first time: right-click (or Control-click) the app and choose **Open**, then **Open** again.
3. If macOS says the app is "damaged" or still blocks it, run: `xattr -cr "/Applications/ftc-judge-prep.app"`
   (or allow it in System Settings → Privacy & Security → **Open Anyway**).

**Windows**
1. Download `ftc-judge-prep-<version>-setup.exe` and run it.
2. If SmartScreen shows "Windows protected your PC", click **More info** → **Run anyway**.

**First launch**
- Use the "One-time downloads" card to fetch the speech model (~75 MB) and, for Audio mode, the judge voice pack
  (~115 MB, the `audio-<season>` release asset).
- Open Settings and add your AI endpoint and key (feedback and judge voice need them).
- Allow microphone (and camera, if you record video) access when prompted.

## Commands
```
npm install
npm run dev              # run the app
npm run typecheck
npm run validate-bank    # checks every bank question/follow-up exists in data/sources/<season>/question-bank.pdf
npm run gen-audio        # pre-generate bank audio (see below); skips existing files
npm run build:mac | build:win
```

## Content
- `data/bank/<season>/questions.json`: curated from FIRST's Judging Question Bank PDF. `sourceText` records the
  verbatim PDF wording wherever the spoken `text` was lightly fixed (typos, trailing colons).
- `data/rubrics/<season>/rubric.json` + `data/rubrics/manifest.json` (`active` season).
  To replace the rubric: add a new season folder and change `active`, or use Rubric > Import in the app.
- `data/sources/`: original FIRST PDFs, used by the validator and excluded from the installer.

## Generating bank audio
```
npm run gen-audio [season] [personaId...]
```
Uses Azure Speech (`SPEECH_ENDPOINT`, optional `SPEECH_KEY`, else `az login`; see `.env.example`). One set per judge persona in `data/personas.json` (voice + accent). Output: `data/audio/<season>/manifest.<persona>.json` plus mp3s. Not bundled: run `npm run pack-audio` and upload `dist/audio-<season>.zip` to the `audio-<season>` release (`gh release upload audio-<season> dist/audio-<season>.zip --clobber`).

## New season checklist
1. Download the new question bank + Judging Feedback Form into `data/sources/<season>/`.
2. Update `questions.json` and `rubric.json`; run `npm run validate-bank <season>`.
3. Set `active` in `data/rubrics/manifest.json`; run `npm run gen-audio`.

## License
MIT, see [LICENSE](LICENSE). The FIRST question bank and rubric content in `data/` belongs to FIRST and is not covered by this license.
