# Security

Please report a security problem privately, through GitHub's
[Report a vulnerability](https://github.com/ftrain/mouseparty/security/advisories/new)
form, not in a public issue.

Only the latest release is fixed. Mouse Party is one person's project, with no
promise of how soon a fix comes.

The macOS sandbox policies are in [`sandbox.go`](sandbox.go).

On experimental Linux builds, the viewer site, both ffmpeg roles, MediaMTX and
cloudflared share a [bubblewrap launch policy](bubblewrap_linux.go): private
mount and process namespaces, a minimal environment, read-only system runtime
mounts, and disposable scratch space. Those runtime mounts can contain
executables; only the viewer adds a seccomp filter that denies executing programs.

- The [**viewer site**](site_linux.go) has embedded pages, read-only WASM tools,
  and a private network namespace. It accepts on the inherited host listener.
  The parent hands it connected sockets for just MediaMTX HLS and WebRTC; a fixed
  RPC reports live status without exposing the control API. Its
  [seccomp filter](seccomp_linux.go) also blocks opening or reconnecting sockets.
  Failure to set up either layer stops hosting.
- **Offline ffmpeg** covers frame grabs (`Host.Frame`), media inspection, and
  text subtitle conversion and cover extraction. Each invocation sees one
  host-selected regular file, mounted read-only by descriptor, not its parent
  directory. Replacing the selected path cannot widen the mount. The network is
  private, and outputs go to stdout/stderr; the parent can direct stdout to its
  open cover file. These jobs do not add a seccomp filter or resource limits.
- [**Publishing ffmpeg**](ffmpeg_linux.go) gets read-only, descriptor-pinned
  regular input and temporary files at the paths its filters use, plus read-only
  system fonts. It publishes to MediaMTX and reports progress on stdout.
- [**MediaMTX**](host_linux.go) gets the session folder read-only at its real path
  for the config and stand-by stream, the system resolver, and a private working
  directory for generated state such as certificates.
- [**cloudflared**](host_linux.go) gets the system resolver and CA bundle files,
  not the session folder or the certificate directories as a whole.

Publishing ffmpeg, MediaMTX and cloudflared share the host network. Bubblewrap
has no port ACL: they can connect and listen, including on host abstract Unix
sockets, subject to the usual OS permissions.

Linux sandboxing needs an up-to-date `bwrap` on `PATH` with `--disable-userns`
and working unprivileged user namespaces. Both ffmpeg boxes need `--ro-bind-fd`;
the viewer needs seccomp and amd64 or arm64. Setup failures never trigger an
unboxed retry. The party file's explicit `no_sandbox` disables these protections.

See [Testing Mouse Party](docs/testing.md#linux-sandbox-and-desktop-smoke-test)
for `scripts/test_linux.sh`, which exercises the boxes and runs the headless
`--selftest` against real MediaMTX and publishing ffmpeg.
