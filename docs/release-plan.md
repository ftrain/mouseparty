# Releasing Mouse Party so anyone can run it

Goal: downloads that install and open without warnings on a Mac, on Windows and
on Fedora Linux, built by GitHub Actions from a version tag
(`.github/workflows/app.yml`: a job for each platform, and a release job that
uploads them all). Each platform is x86_64 or Apple Silicon only: arm64 Linux and Windows on Arm
are not built.

Prices below are approximate; check them before paying.

## Before any public release

- [x] **Public downloads:** github.com/ftrain/mouseparty is public (begun afresh;
      the history before it stays in the private, archived ftrain/minecast).
- [x] **Licences shipped with the app:** `licenses/` (every bundled program,
      library and Go module, with its licence text) goes into each build as
      `Contents/Resources/Licenses` (`resources/licenses` on Linux and Windows), the About box points there, and each release
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

- [ ] Add them as the secrets `.github/workflows/app.yml`'s first lines name
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
- [x] A **`.dmg`** (drag to Applications), signed and notarized with the rest: the Mac's
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

## 2. Windows: signed installer

The release's Windows file is `MouseParty-windows-x86_64-setup.exe`, a per-user
NSIS installer (`packaging/windows/installer.nsi`) that needs no administrator and
installs to `%LOCALAPPDATA%\Programs\Mouse Party`. Updates download the next one,
check its SHA-256 (and, once this build is signed, its Authenticode signature and
signer), and run it silently when Mouse Party quits.

You, once:
- [ ] A code-signing certificate (an OV or EV certificate from a CA, or Azure
      Trusted Signing, about $10/month). Unsigned, SmartScreen warns on first run
      ("More info" > "Run anyway").
- [ ] Add it as the repository secrets `WINDOWS_CERTIFICATE_PFX` (base64) and
      `WINDOWS_CERTIFICATE_PASSWORD`; `scripts/build_windows_app.sh` signs the app, its
      own programs and the installer from that PFX. A certificate whose key stays in
      hardware or a cloud service (as new ones do) needs that step changed to sign
      through the service.

Me:
- [x] Installer and uninstaller; "Open with" entries, never the default app.
- [x] The app's own ffmpeg, cross-built from pinned sources on Fedora (mingw-w64).
- [ ] Verify on a clean Windows 10 and 11: first hosting asks the firewall once;
      WebView2 is there (Windows 11 always; Windows 10 installs it on first run).

## 3. Linux: AppImage and RPM

Two Linux files: `MouseParty-linux-x86_64.AppImage`, one file that updates itself
like the Mac app (it uses the system's GTK 3 and WebKitGTK 4.1), and
`MouseParty-linux-x86_64.rpm` for `dnf install` on Fedora 43 and later, which
installs to `/opt/mouseparty` and is updated by installing the next RPM (the app
says when one is out). Both are built in a Fedora container.

- [ ] Optional: sign the RPM with a GPG key, and publish the key.
- [ ] Optional: a dnf repository (COPR) so `dnf upgrade` finds new versions.
- [ ] Verify on clean Fedora Workstation 43 and 45: the AppImage opens from Files
      (after "Allow executing"), and the RPM's desktop entry opens it.

## What stays the same

Hosting from home still depends on each person's router: UPnP or NAT-PMP to open
the ports, or the Cloudflare link (with STUN) when the router can't. The app
already says which applies.
