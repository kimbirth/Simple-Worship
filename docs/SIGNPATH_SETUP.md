# SignPath Foundation setup

This checklist is for project maintainers after the repository is public and
the first release exists.

1. Confirm the maintainer roles in `CODE_SIGNING_POLICY.md` and update them when
   another reviewer or approver joins the project.
2. Enable multi-factor authentication for every maintainer and signing-team
   member.
3. Protect the release branch against deletion and force pushes. Require pull
   requests for non-committer changes.
4. Apply for a SignPath Foundation open-source subscription at
   <https://signpath.org/apply.html> and provide the public repository and
   release URLs.
5. In SignPath, create the SimpleWorship project, artifact configuration, and a
   release-signing policy with origin verification and manual approval.
6. Add the predefined GitHub.com trusted build system to the SignPath
   organization and project. Install the SignPath GitHub App for this
   repository when requested.
7. Store the submitter token as the GitHub Actions secret
   `SIGNPATH_API_TOKEN`. Store non-secret SignPath identifiers as repository
   variables.
8. Enable the signing workflow only after SignPath supplies and confirms the
   organization ID, project slug, signing-policy slug, and artifact-
   configuration slug.

The intended release workflow is:

1. Build the unsigned Windows installer on a GitHub-hosted Windows runner.
2. Upload it as a GitHub Actions artifact.
3. Submit that artifact with
   `signpath/github-action-submit-signing-request@v3`.
4. Wait for manual SignPath approval and download the signed result.
5. Verify the Authenticode signature and publish only the signed installer.

Never commit or print the SignPath API token. Unsigned workflow artifacts are
for verification and signing input only; they are not releases.

Official references:

- <https://signpath.org/terms.html>
- <https://docs.signpath.io/trusted-build-systems/github>
- <https://docs.signpath.io/origin-verification/>
