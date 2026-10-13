# SimpleWorship

A desktop worship presentation app for church services, built with Electron, React, TypeScript, and SQLite.

## Features

- Song database with simple `[Block]` lyric formatting
- Required first-run Bible import with multiple installed translations, a version selector, verse ranges, and quick-reference search
- App-wide default backgrounds for songs and Bible verses
- Staging-to-live workflow with independent Black, Clear, and Logo overlays
- Smooth looping image/video backgrounds with crossfade transitions
- Fullscreen multi-display output
- Flat-folder media indexing with viewport-aware thumbnails and bounded media pages
- Fast in-app song background selection with lazy first-frame video thumbnails
- VJ background overrides and adjustable 2×2 through 5×5 grids
- Named service Save/Open files (`.sws`)
- Manual database backup and restore (`.swb`)
- Rolling automatic safety backups with corruption recovery
- Missing-media detection for the library, songs, default background, logo, schedule, staging, and live output
- Saved panel layout and keyboard shortcuts in both operator and output windows

## Run on Windows without Visual Studio

1. Install Node.js 22.18 or newer (the current LTS is recommended) from <https://nodejs.org>.
2. Extract the project to a normal folder such as `Documents\SimpleWorship`.
3. Double-click `RUN-SIMPLEWORSHIP.bat`.

The launcher installs dependencies, repairs a missing Electron executable, and keeps the window open if startup fails. Visual Studio and C++ build tools are not required.

To check the source without opening the app, run `CHECK-PROJECT.bat`.

## Change the app logo

Replace the root `logo.png` with a square PNG, ideally 512×512. That single file is used by the top bar, renderer icon, app windows, taskbar, and installer.

## Command line

```bash
npm ci
npm run dev
```

Production-only installs (`npm ci --omit=dev`) intentionally skip the Electron
binary download. Electron is a development dependency used to run and package
the app, while an installed application contains its own Electron runtime.

## Quality checks

Run the same local gate used by every release package command:

```bash
npm run check
```

This checks source hygiene, both TypeScript configurations, the `node:test`
suite, and the production bundle. Tests cover lyrics, Bible references, default
backgrounds, overlays, media URLs and validation, media authorization, and video
byte ranges. `CHECK-PROJECT.bat` runs this complete gate on Windows.

Before a release, while online, run:

```bash
npm run release:check
```

This also blocks on high-severity vulnerabilities across the complete dependency
tree, including Electron and the packaging toolchain. Use `npm run audit:prod`
for a narrower production-library check. Do not use `npm audit fix --force`
without reviewing the proposed major dependency changes.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Arrow keys or Page Up/Page Down | Previous/next live block |
| `Ctrl+B` | Toggle Black |
| `Ctrl+C` | Toggle Clear |
| `Ctrl+L` | Toggle Logo |
| `Esc` while Output is focused | Close Output |

Black, Clear, and Logo are independent output layers. Going live changes the cue underneath without resetting the active layers.

## First-run setup

1. Import at least one lawfully obtained `.swbible` package in the required setup dialog.
2. Open Settings and select the projector under Output Screen.
3. Select the folder containing background images and videos.
4. Choose the default song/Bible background and logo from the indexed media.
5. Use Settings → Data Backup & Recovery to create a portable backup after entering the song library.

SimpleWorship automatically keeps up to 12 local safety backups. Restore replaces songs, the current schedule, settings, and the media index after first saving the current database as a safety copy. Named schedule files are saved separately and include song, Bible, and media cues.

Older `.simpleworship-schedule` and `.simpleworship-backup` files can still be opened.

## Song lyric format

```text
[Verse 1]
First line here
Second line here

[Chorus]
Chorus line one
Chorus line two
```

Lyrics default to bold 90 px and shrink only when necessary to fit the output frame.

## Bible packages

Bible translations are often copyrighted, so the open-source project and its
normal public installers do not include Bible text. On first launch,
SimpleWorship requires a valid `.swbible` package before continuing. From the
Bible tab, choose **Import Bible** at any time to add another package. Every
package is validated and copied separately into the current user's app-data
folder, so importing NIV does not replace RTPV05. When more than one
translation is installed, the Bible tab shows a version selector and remembers
the selected translation across restarts.

Maintainers who have a compatible, lawfully obtained SQLite Bible database can
create a package without modifying the source database:

```bash
npm run bible:convert -- input.db Output.swbible
```

The converter verifies the schema, records, internal package identifier, and
completed output. It refuses to overwrite an existing package unless `--force`
is supplied. Bible database and `.swbible` files are intentionally excluded
from source control.

### Optional licensed distribution

If you have explicit permission to redistribute a translation, place its
`.swbible` file in the local `distribution-bibles` folder and run:

```bash
npm run bible:validate-distribution
npm run build:win:unsigned:with-bibles
```

The dedicated build includes those validated files as first-run import choices.
The normal build and public CI remain Bible-free, and `.swbible` files in that
folder are ignored by Git. For a signed private build using your own Windows
certificate, use `npm run build:win:with-bibles`.

Permission to possess or use a Bible translation is not automatically
permission to redistribute it. In particular, do not place NIV, RTPV05, or any
other copyrighted text in a public release until the copyright owner has
granted the necessary distribution rights. A private Bible-containing build
also should not be submitted to SignPath Foundation unless SignPath confirms it
meets the Foundation program's eligibility rules.

## Build an installer

Official Windows installers are built by GitHub Actions and signed through
SignPath. The unsigned build is uploaded as a workflow artifact before the
signing request, allowing SignPath to verify its repository, commit, workflow,
and GitHub-hosted runner origin.

For a local packaging rehearsal, run:

```bash
npm run build:win:unsigned
```

or double-click `BUILD-WINDOWS-INSTALLER.bat`. The installer is written to
`release`. Unsigned packages trigger operating-system trust warnings and must
not be distributed as releases.

Maintainers using their own Windows certificate can set `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD` and run `npm run build:win`. These credentials must stay
in the shell or CI secret store. SignPath Foundation releases instead follow
[`docs/SIGNPATH_SETUP.md`](docs/SIGNPATH_SETUP.md).

Before using a new installer during a service, complete the checks in
[`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) on the church computer and projector.

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/). The complete policy, team
roles, approval rules, and privacy statement are in
[`CODE_SIGNING_POLICY.md`](CODE_SIGNING_POLICY.md).

## Privacy and security

SimpleWorship has no telemetry or advertising and does not send presentation,
song, Bible, settings, or media data to external systems. See
[`PRIVACY.md`](PRIVACY.md) and [`SECURITY.md`](SECURITY.md).

## Project structure

```text
src/
  main/
    index.ts          Electron windows, dialogs, media checks, and IPC
    db.ts             Songs, settings, media index, backup, and recovery
    bibleDb.ts        Multi-package Bible library, validation, selection, and queries
    bibleLibraryIdentity.ts  Stable package/storage/translation identities
    mediaServer.ts    Restricted local media streaming
  preload/
    index.ts          Operator IPC bridge
    output.ts         Output IPC bridge
  renderer/src/
    App.tsx
    output.tsx
    store/AppStore.tsx
    components/
      bible/BibleTab.tsx and BibleSetupDialog.tsx
      editor/SongEditorModal.tsx
      layout/
      media/MediaGrid.tsx
      schedule/SchedulePanel.tsx
    hooks/
    styles/
    types/
    utils/
```

Generated dependencies, build output, logs, environment files, and signing
certificates are excluded from source control. Distribute source and installers
separately.

## Recommended video format

- MP4 (H.264), 1920×1080, 30 fps
- Muted, short loop with matching first and last frames
- Keep service media directly inside one indexed folder; nested folders are intentionally ignored

## License

SimpleWorship is licensed under the [Apache License 2.0](LICENSE).
