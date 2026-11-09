# Releasing Mouse Party so anyone can run it

Goal: a download that installs and opens without warnings on a Mac, built by
GitHub Actions from a version tag (`.github/workflows/mac-app.yml`). Mouse Party
is a Mac app only: nothing is built for Linux or Windows.

Prices below are approximate; check them before paying.

## Before any public release

- [x] **Public downloads:** github.com/ftrain/mouseparty is public (begun afresh;
      the history before it stays in the private, archived ftrain/minecast).
- [x] **Licences shipped with the app:** `licenses/` (every bundled program,
      library and Go module, with its licence text) goes into each build as
      `Contents/Resources/Licenses`, the About box points there, and each release
      carries the exact sources of its GPL ffmpeg.
- [x] **A licence for Mouse Party itself:** MIT.

## 1. macOS: signed and notarized

You, once:
- [ ] Join the Apple Developer Program as an individual (about $99/year;
      approval takes anything from minutes to a couple of days).
- [ ] Create a **Developer ID Application** certificate; export it as `.p12` with
      a password.
- [ ] Create an **App Store Connect API key** for notarization (key, key ID, issuer ID).
- [ ] Add all of these as GitHub repository secrets.

- [ ] Add them as the secrets `.github/workflows/mac-app.yml`'s first lines name
      (`MACOS_CERTIFICATE_P12` as base64, `MACOS_CERTIFICATE_PASSWORD`,
      `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`), and push a tag.

Me:
- [x] Release workflow: imports the certificate into a temporary keychain on the
      runner when the secrets are there; `scripts/build_mac_app.sh` signs every binary
      inside with the hardened runtime and a timestamp, then the app (with
      `packaging/darwin/entitlements.plist`: wazero's compiled code needs
      allow-unsigned-executable-memory), notarizes with `notarytool` and the API key,
      and staples the ticket. Every build has the hardened runtime, ad hoc without a
      certificate, so CI's self-test runs it as a signed release runs.
- [x] A **`.dmg`** (drag to Applications), signed and notarized with the rest: a release's one
      download, which updates fetch too (checked by the SHA-256 GitHub gives each file), beside
      one archive of the GPL sources.
- [x] `NSLocalNetworkUsageDescription` in Info.plist: macOS 15 asks before an app
      talks to the router (the NAT-PMP/UPnP port request); it says why.
- [x] Updates take only an app signed by the same Developer ID team as the one
      running, once that has one (`updates.go` `teamOf`, `checkBundle`).
- [ ] **Intel Macs:** a second build on an Intel runner (all bundled tools have
      x86-64 builds), or one universal build.
- [ ] Verify on a clean Mac: opens with no Gatekeeper warning; the firewall's
      "accept incoming connections?" answer survives an update (it doesn't with
      today's ad-hoc signing).

- [x] In-app updates: a check against this repo's releases (`updates.go`).

## What stays the same

Hosting from home still depends on each person's router: UPnP or NAT-PMP to open
the ports, or the Cloudflare link (with STUN) when the router can't. The app
already says which applies.
