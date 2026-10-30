# Releasing Mouse Party so anyone can run it

Goal: a download that installs and opens without warnings, on macOS, Linux and
Windows, built by GitHub Actions from a version tag (as `.github/workflows/mac-app.yml`
does today for an unsigned Apple Silicon build).

Order: **macOS signing** (waits only on the Apple enrolment), then **Linux**
(no accounts or fees), then **Windows** (most porting, plus a signing choice).
Linux first makes the Windows port smaller: most code changes are shared.

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

Me:
- [ ] Release workflow: import the certificate into a temporary keychain on the
      runner; sign every binary inside (Mouse Party, MediaMTX, cloudflared, ffmpeg) with
      the hardened runtime and a timestamp, then the app; notarize with
      `notarytool` using the API key; staple the ticket. `scripts/build_mac_app.sh`
      already has `SIGN_IDENTITY`/`NOTARY_PROFILE`; adapt it to the API key on CI.
- [ ] A signed, notarized **`.dmg`** (drag to Applications) instead of a bare zip.
- [ ] `NSLocalNetworkUsageDescription` in Info.plist: macOS 15 asks before an app
      talks to the router (the NAT-PMP/UPnP port request); say why.
- [ ] **Intel Macs:** a second build on an Intel runner (all bundled tools have
      x86-64 builds), or one universal build.
- [ ] Verify on a clean Mac: opens with no Gatekeeper warning; the firewall's
      "accept incoming connections?" answer survives an update (it doesn't with
      today's ad-hoc signing).

Later, maybe: in-app updates (Sparkle, or a check against GitHub releases).

## 2. Linux: AppImage

No signing required. Me, all of it:
- [ ] Router discovery already works there (jackpal/gateway reads the route table).
- [ ] Fonts: the cards name Menlo's file (`stream.go`); ask ffmpeg's drawtext for
      any monospace font instead, which works on every OS.
- [ ] The host's language: `defaults read -g AppleLanguages` is macOS's; `$LANG`
      is the fallback already (`hostLanguage`).
- [ ] Wails on Linux needs WebKitGTK; check the build and its drag and drop.
- [ ] Linux build script: `wails build -platform linux/amd64`; bundle MediaMTX,
      cloudflared and ffmpeg (`scripts/build_ffmpeg.sh` ported: the same pinned
      sources, with fontconfig where it uses CoreText);
      package as an **AppImage**.
- [ ] CI on an older Ubuntu runner (a build only runs on systems at least as new
      as the one it was built on), with `--selftest` as on macOS. x86-64 first;
      ARM later if wanted.
- [ ] Optional: publish SHA-256 checksums signed with a GPG key beside each download.

Later, maybe: Flatpak on Flathub (built from source and reviewed there; needs its
sandbox opened for networking), or `.deb`/`.rpm` if people ask.

## 3. Windows

Me (port):
- [ ] Stopping ffmpeg and the tools: Unix process groups and signals become
      `CREATE_NEW_PROCESS_GROUP` and `CTRL_BREAK_EVENT` (`Player.Stop`, `stopGroup`),
      and the shell watchdog becomes a Windows job object.
- [ ] Fonts (Consolas).
- [ ] Windows build (`wails build -platform windows/amd64`, WebView2; MediaMTX,
      cloudflared and ffmpeg Windows builds), with `--selftest`.
- [ ] An installer (Inno Setup) or a portable zip.
- [ ] First tested unsigned (SmartScreen: "More info > Run anyway").

You (signing), pick one:
- [ ] **Azure Trusted Signing**, Microsoft's signing service (roughly $10/month;
      open to individuals in some countries; check eligibility). Plugs into CI.
- [ ] A **code-signing certificate** from a CA. How fast SmartScreen trusts new
      signers has changed over the years; expect some warnings until downloads
      build reputation.
- [ ] The **Microsoft Store**, which signs for you.

## What stays the same everywhere

Hosting from home still depends on each person's router: UPnP or NAT-PMP to open
the ports, or the Cloudflare link (with STUN) when the router can't. The app
already says which applies.
