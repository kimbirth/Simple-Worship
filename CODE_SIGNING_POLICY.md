# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

## Signed releases

Official Windows releases are built from this public repository by GitHub
Actions on GitHub-hosted runners. The unsigned installer is stored as a workflow
artifact before it is submitted to SignPath. Release signing requires origin
verification and manual approval. Only the signed artifact returned by SignPath
may be attached to a public release.

Build scripts, dependency locks, GitHub Actions workflows, and signing
configuration receive the same review as application source code. Private
signing keys are never stored in this repository.

## Team roles

The following GitHub account is currently responsible for the project:

- Authors and committers: `@kimbirth`
- Reviewers: `@kimbirth`
- Approvers: `@kimbirth`

Changes from people who are not committers require review by a project reviewer.
Every release-signing request requires manual approval by an approver. Everyone
in these roles must use multi-factor authentication for GitHub and SignPath.

## Privacy

See the [privacy policy](PRIVACY.md). This program will not transfer any
information to other networked systems unless specifically requested by the
user or the person installing or operating it.
