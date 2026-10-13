# SimpleWorship 1.2.6

This is the first public source release of SimpleWorship, a desktop worship
presentation app for churches.

## Highlights

- Fast in-app image and video background selection for songs.
- Video thumbnails appear before hover and offscreen previews unload to keep
  large media folders responsive.
- User-installed `.swbible` packages, plus a validated `.db` to `.swbible`
  converter for lawfully obtained Bible databases.
- Reliable staging, live output, media streaming, schedule persistence,
  backups, missing-media handling, and keyboard control.
- Automated lint, type, test, build, and dependency-audit checks on GitHub.

See the [changelog](../CHANGELOG.md) for the complete list.

## Windows installer

This initial release is source-only while the SignPath Foundation open-source
code-signing application is in progress. No unsigned binaries are attached.

The `v1.2.6` tag automatically builds an unsigned Windows installer on a
GitHub-hosted runner as a private workflow artifact. After SignPath approves
the project, the artifact will be submitted for signing and only the verified,
signed installer will be attached to this release.

Free code signing will be provided by [SignPath.io](https://signpath.io/), with
a certificate from [SignPath Foundation](https://signpath.org/). See the
[code signing policy](../CODE_SIGNING_POLICY.md) and
[privacy policy](../PRIVACY.md).
