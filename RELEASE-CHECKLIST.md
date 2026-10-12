# SimpleWorship release checklist

Complete this checklist on the church Windows computer before replacing the service build.

## Install and launch

- Run `npm run release:check` while online and confirm the build and complete dependency audit pass.
- Set the signing variables described in `README.md`, run `BUILD-WINDOWS-INSTALLER.bat`, and confirm the generated installer has a valid digital signature before installing it.
- Confirm the operator opens maximized and retains the app and taskbar logo.
- Confirm existing songs, settings, schedule, media folder, and logo remain available after upgrading.

## Output and controls

- Select the projector in Settings and open Output.
- Confirm Output is fullscreen on the projector and the operator remains usable on the primary display.
- Confirm Alt+Tab does not minimize the projector output.
- Confirm Escape closes Output when Output is focused.
- Test Ctrl+B, Ctrl+C, Ctrl+L, arrow keys, and Page Up/Page Down from both windows.
- Test Black, Clear, and Logo individually and together, including pressing Go Live while an overlay is active.

## Songs and media

- Double-click a song to stage it, edit it, and confirm its scheduled copy updates.
- Go Live and change lyric blocks from Staging, Production, and the keyboard.
- Test image, color, and H.264 MP4 backgrounds.
- Open Media, VJ/BG, and the Song Editor background picker; confirm visible videos show a still thumbnail before hover and that scrolling a large folder remains responsive.
- Select an app-wide default background and confirm songs and Bible verses set to Default inherit it.
- Search for a Bible reference, stage a verse range, add it to the schedule, save/reopen the schedule, and confirm the text, superscripts, citation, and background remain correct.
- Let a representative video loop for at least 60 minutes and watch for black frames, stutter, or memory pressure.
- Load the normal media folder, scroll the VJ grid, change grid density, and apply/clear a VJ override.
- Temporarily rename one media file and confirm the filename is shown as Missing or moved.

## Bible package

- Launch without a Bible package and confirm the Bible tab offers **Install .swbible package** without affecting the rest of the app.
- Install a valid, lawfully obtained `.swbible` package and confirm its version, books, chapters, verse order, and text.
- Restart SimpleWorship and confirm the installed package remains available from the per-user app-data folder.
- Confirm the source repository and official installer contain no `bible.db`, `.swbible`, or other copyrighted Bible text.

## Save and recovery

- Save a service as `.sws`, restart SimpleWorship, and open it again.
- Make a final schedule edit and immediately close/reopen the app; confirm that edit remains.
- Create a `.swb` backup, make a temporary data change, restore the backup, and confirm the temporary change is gone.
- Keep a separate backup of the actual media folder; `.swb` stores data and file references, not the video/image files.

When every item passes, keep the tested installer, `.swb` backup, `.sws` service, and media-folder backup together for service use.
