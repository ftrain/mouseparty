# Security

Please report a security problem privately, through GitHub's
[Report a vulnerability](https://github.com/ftrain/mouseparty/security/advisories/new)
form, not in a public issue.

Only the latest release is fixed. Mouse Party is one person's project, with no
promise of how soon a fix comes.

How the app limits what a guest can reach is described in `CLAUDE.md` (the `sandbox.go` + `site.go` entry): Seatbelt on macOS (`sandbox_darwin.go`), Landlock and seccomp on Linux (`box_linux.go`), and a job object with a low-integrity token on Windows (`box_windows.go`).
