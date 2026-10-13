# Changelog

## 1.2.6 — Bible packages, media speed, reliability, and release hardening

- Requires an explicit Bible import on first launch, keeps each `.swbible` package separately, and adds a persistent version selector when multiple translations are installed.
- Adds a validated, opt-in private distribution build for translations with explicit redistribution permission while keeping public builds Bible-free.
- Adds a validated `.db` to `.swbible` converter without publishing Bible text.
- Preserves the bundled Bible browser, verse cues, multi-slide song blocks, and app-wide default backgrounds from the 1.2.6 source.
- Keeps output text and backgrounds synchronized while media loads and falls back to black when media fails.
- Supports image/background cues consistently across Media, schedules, persistence, validation, preview, and live output.
- Persists schedule edits immediately with crash-safe local recovery while preserving intentional backup restores.
- Restricts and hardens local media streaming, supports dynamic-port fallback, and handles stream failures without crashing.
- Keeps Media, Settings, and VJ views synchronized and repairs background override, drag/drop, and editor-save edge cases.
- Shows video thumbnails before hover, unloads offscreen media, bounds VJ browsing to 100-item pages, and adds a fast, lazy-loaded in-app image/video background picker to the Song Editor.
- Adds keyboard and focus affordances across cards, dialogs, tabs, window controls, and resizable panel separators.
- Validates and migrates backup schemas, deduplicates automatic backups, and repairs macOS reopen behavior.
- Adds lint/type/test/build/audit gates, CI verification, signed-release enforcement, and an explicit unsigned rehearsal path.
- Adds privacy, security, contribution, and SignPath code-signing policy documentation.
- Adds GitHub verification and unsigned signing-input workflows for reproducible Windows builds.
- Removes the internal self-signed-certificate workflow from the public source distribution.
- Updates Electron to 44.5.0 and sql.js to 1.14.2 while excluding unused sql.js builds from packages.

## 1.0.1 — Single-source app logo

- Makes the root `logo.png` the single logo source for the top bar, renderer icon, Electron windows, taskbar, and installer.
- Removes the duplicate renderer-public logo that could remain stale after replacing the app logo.

## 1.0.0 — Final internal church release

- Removes retired per-song typography and thumbnail fields from the active application model and new databases.
- Removes unused staging/live overlay actions and the abandoned output overlay IPC channel.
- Simplifies the operator canvas compositor to its actual preview-only responsibility; live output keeps its dedicated crossfade renderer.
- Removes unused lyric utilities, media-server exports, hook values, CSS rules, and styling dependencies.
- Enforces unused-local and unused-parameter checks in both Electron and renderer TypeScript projects.
- Preserves old database, service-file, backup, schedule, and saved-layout migration paths that still protect existing church data.

## 0.4.2 — Named missing-logo details

- Stores the selected logo filename and path instead of exposing an internal media index when it becomes unavailable.
- Shows a named Missing or moved logo card with its last known path and a Remove action.
- Migrates existing logo selections to the new metadata when the original media record is still available.

## 0.4.1 — Final file formats and app identity

- Changes service files to `.sws` and backups to `.swb`, while retaining support for older file extensions.
- Removes manual and periodic missing-media rechecks; missing or moved files are detected automatically and labeled in the operator UI.
- Explicitly applies `logo.png` to packaged resources, Electron windows, and Windows taskbar grouping.

## 0.4.0 — SimpleWorship

- Renames and rebrands the private church app as SimpleWorship with `logo.png`.
- Adds named schedule Save/Open files.
- Adds manual backup/restore, rolling automatic backups, and damaged-database recovery.
- Adds missing-media checks and operator warnings.
- Removes disconnected Bible, Announcement, duplicate panel, and obsolete compositor code.

## 0.3.8 — Focused help and simplified song styling

- Adds a top-bar `?` panel containing the active keyboard shortcuts.
- Adds Song Editor `?` help focused only on the square-bracket song-block format.
- Removes Space and Enter presentation hotkeys from Operator and Output.
- Removes native hover tooltips throughout the application and retains accessible labels for icon buttons.
- Removes Song Editor placeholders and replaces them with visible Title, Artist, and Lyrics labels.
- Removes per-song font family, size, bold, italic, color, and shadow controls.
- Standardizes lyrics to bold white Tahoma at a 90 px maximum with automatic shrink-to-fit and shadow.
- Shows image backgrounds and a decoded static video frame in the Song Editor preview.
- Places Color and Fade on one VJ/BG row and opens an app-controlled color palette at the cursor.

## 0.3.7 — Flat media folders and repaired VJ scrolling

- Limits Media and VJ/BG indexing to files directly inside the selected folder; subfolders are ignored.
- Fixes the VJ tab's flex-height chain so the background grid receives a bounded height and scrolls internally.
- Keeps incremental thumbnail loading and large-folder protections while scrolling.
- Makes the VJ refresh button re-index the folder so previously indexed subfolder entries are removed.

## 0.3.6 — Scrollable VJ/BG browser

- Replaces VJ/BG page navigation with continuous vertical scrolling.
- Loads more background thumbnails in small batches near the bottom of the grid to preserve large-folder stability.
- Automatically fills short grids until the panel has enough content to scroll.
- Shows the loaded and total background count beside the VJ/BG heading.

## 0.3.5 — Large media library stability

- Fixes VJ/BG thumbnails stretching into tall black columns when a grid row has extra height.
- Replaces the separate VJ grid buttons with a saved 2×2–5×5 density slider.
- Paginates VJ/BG, Media, and Settings logo thumbnails so large folders do not create every preview at once.
- Defers video thumbnail decoding until hover.
- Indexes folders asynchronously and writes the complete media index in one database transaction instead of persisting once per file.
- Avoids returning a duplicate full media list over IPC after indexing.

## 0.3.4 — Persistent layered output states

- Keeps Black, Clear, and Logo active when Go Live changes the cue or slide underneath them.
- Makes Black, Clear, and Logo independent output layers; Black has visual priority and can cover an active Clear state.
- Shows every active output layer in the Production controls and status badge.
- Adds saved 4×4 and 5×5 VJ/BG grid density options.

## 0.3.3 — Black recovery and Output escape

- Fixes image/video backgrounds not returning after toggling Black.
- Reuses already-loaded background layers immediately instead of waiting for a second load event.
- Adds `Esc` while Output is focused to close Output and restore/focus the operator window.

## 0.3.2 — Live reliability and media UI

- Fixes Go Live and slide changes being lost during Output window startup/replacement.
- Removes React development double-invocation around the output-opening workflow.
- Makes Output request the current scene after its renderer listeners are ready.
- Keeps Output replacement from falsely reporting the new window as closed.
- Routes Space, Enter, navigation, and Ctrl+B/C/L hotkeys from the focused Output window to the operator.
- Shows a decoded static first frame for video backgrounds in Staging and Production previews.
- Reworks the Media tab into a compact two-row toolbar with clearer folder, count, filters, search, and refresh controls.

## 0.3.1 — Saved layouts and single-monitor output

- Maximizes the operator window on startup without a window-size flash.
- Makes the song editor preview follow the lyrics cursor's current song block.
- Restores horizontal panel resizing with 20/40/40 as the default.
- Saves horizontal panel widths and all three vertical split positions.
- Double-clicking a horizontal divider restores the default 20/40/40 layout.
- Keeps single-monitor Output as a separate fullscreen Alt+Tab window without pinning it over the operator.
- Keeps secondary-monitor Output pinned fullscreen and protected from minimizing.
- Adds saved 2-, 3-, and 4-column VJ background grid options.

## 0.3.0 — Presentation workflow

- Keeps the output window fullscreen and restores it immediately if Windows tries to minimize it.
- Uses a fixed 20/40/40 operator layout for Library, Staging, and Production.
- Double-clicking a song now stages it; drag-and-drop remains the way to add it to the schedule.
- Removes the song-row add-to-schedule button.
- Updates scheduled, staged, and live copies when a song is edited.
- Removes Bible and Announcement features from the operator interface.
- Stops decoding video inside Staging and Production previews; video plays only on live output.
- Changes default lyrics to bold 90 px with automatic shrink-to-fit.
- Crossfades lyrics, song blocks, Black, Clear, Logo, and VJ background changes.
- Connects the Settings fade slider to the active output renderer.
- Changes overlay shortcuts to Ctrl+B, Ctrl+C, and Ctrl+L.
- Allows the Staging and Production preview canvases to shrink much further.

## 0.2.2 — Electron 43 binary installer

- Runs Electron 43's included binary downloader directly after `npm ci`.
- Fixes electron-vite's `Error: Electron uninstall` when `path.txt` and `electron.exe` are absent.
- Replaces the ineffective `npm rebuild electron` fallback in the Windows launcher.

## 0.2.1 — Windows launcher repair

- Detects when Electron's Windows executable was skipped during npm installation.
- Automatically rebuilds or reinstalls Electron before starting the development server.
- Clears inherited npm settings that disable package install scripts or Electron downloads.
- Uses `npm ci` for a clean, reproducible first installation.

## 0.2.0 — Stabilization release

- Replaced projector canvas video rendering with two preloaded native video layers.
- Added smooth background crossfades without restarting video when only lyrics change.
- Standardized local image and video paths through the media server.
- Restricted the media server to indexed, selected, or saved presentation media.
- Enabled Electron sandboxing, web security, and projector background rendering.
- Fixed all TypeScript errors, media dragging, and the song background Browse button.
- Restored saved schedules locally, including announcement layouts.
- Preserved styled announcement text on the projector output.
- Made database writes atomic to reduce corruption risk.
- Fixed projector window replacement and restored scene, fade, and logo state after reopening.
- Fixed packaged builds so `sql.js` is included and removed references to missing icon resources.
- Added Windows run, check, and installer scripts that keep errors visible.
- Updated to Electron 43.1.0 and removed all reported npm dependency vulnerabilities.
