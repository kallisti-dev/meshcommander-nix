# meshcommander-nix

A Nix package for [MeshCommander](https://github.com/Ylianst/MeshCommander),
the browser-based Intel AMT console: hardware KVM, serial-over-LAN, IDE
redirection, power control and AMT configuration. It is built from the current
upstream source rather than the last npm release.

## Usage

Run it directly:

```sh
nix run github:kallisti-dev/meshcommander-nix -- --port 3000
```

Then open <http://127.0.0.1:3000> and enter the AMT host and credentials in
the interface.

To install it from another flake, add this repository as an input:

```nix
inputs.meshcommander = {
  url = "github:kallisti-dev/meshcommander-nix";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

Then use `meshcommander.packages.${system}.default`, or apply
`meshcommander.overlays.default` to get `pkgs.meshcommander`. The package
builds with `buildNpmPackage` and is written so it can move into nixpkgs.

The server listens on 127.0.0.1 unless started with `--any`. It has no
authentication, and it relays browser WebSocket connections to whatever host
and port the page requests, so do not expose it to a network.

## What the package contains

Intel has discontinued support for MeshCommander. The last npm release,
0.9.5-a, dates from March 2022, but the GitHub source has kept receiving fixes,
most recently in July 2026. Those fixes were never released. This package
combines:

- **The Node.js server from the npm 0.9.5-a release.** Upstream publishes it
  only there. Three patches apply:
  - [`ws8.patch`](patches/ws8.patch) replaces `express-ws` 2, which pins the
    vulnerable `ws` 1.x, with `express-ws` 5 and `ws` 8.
  - [`ecdhe-ciphers.patch`](patches/ecdhe-ciphers.patch) adds ECDHE cipher
    suites to TLS connections to AMT. Upstream made the same change in its
    other Node.js clients in 2025; the npm server still offered only RSA key
    exchange.
  - [`no-runtime-install.patch`](patches/no-runtime-install.patch) stops the
    server running `npm install` at startup.
- **The web interface, compiled from upstream commit
  [`1cd156b`](https://github.com/Ylianst/MeshCommander/commit/1cd156ba8740c624bfc458e45535e3da79cbc2bf).**
  This version reports itself as 0.9.7. Changes since 0.9.5-a include IDE
  redirection fixes, keyboard fixes, a reverse-mouse-wheel option, remote
  desktop user-consent fixes, certificate and key matching for newer AMT
  firmware, 802.1X fixes and a storage-erase verification option.

The version, `0.9.5-a-unstable-2026-07-28`, follows the nixpkgs convention for
an unreleased commit: the last release, then the commit date.

## How the web interface is built

Upstream compiles its pages with WebSite Compiler, a Windows-only tool whose
source is not published. [`compile-ui.mjs`](compile-ui.mjs) reimplements what
that tool does for the npm pages: it removes disabled feature blocks, inlines
stylesheets, scripts and some images, and writes the default and remote
variants of each of the 11 languages.

The `web-compiler` check shows that this reproduces the upstream compiler. It
compiles the source commit behind npm 0.9.5-a and compares the result with the
22 pages published in that release. Upstream's tool also rewrites HTML
formatting, so the check compares parsed documents (elements, attributes and
text, including all script content) rather than bytes.

## Checks

`nix flake check` runs:

- `package`: the build.
- `runtime`: the installed command on loopback. It checks HTTP startup, the
  language redirect, and the WebSocket relay to a TCP echo server and to a
  TLS 1.2 echo server that only accepts ECDHE key exchange.
- `web-compiler`: the reproduction check described above.

The checks pass on aarch64-darwin, and CI runs them on `ubuntu-24.04`
(x86_64-linux) and `macos-15` (aarch64-darwin). The flake also exposes
aarch64-linux, which nothing builds or tests.

The checks never contact AMT hardware. KVM, serial-over-LAN, IDE redirection
and power control are tested only by using them. The server does not verify AMT
TLS certificates, as upstream does not. Connecting to firmware that supports
only TLS 1.0 or 1.1 has not been tested; current OpenSSL rejects those
protocols by default.

## Updating

To move to a newer upstream commit, update `webSrc` in
[`package.nix`](package.nix) along with the version's date, then run
`nix flake check`. If upstream has changed the features the pages use, the
compiled output may need a look in a browser too.

The server's dependencies are pinned in `package-lock.json`, because the npm
tarball ships no lockfile. To update them, unpack the tarball, apply the
patches, run `npm install --package-lock-only --ignore-scripts`, copy the
lockfile here, and set `npmDepsHash` from
`prefetch-npm-deps package-lock.json`. `nix develop` provides Node.js, nixfmt
and prefetch-npm-deps.

## License

MeshCommander is by Ylian Saint-Hilaire and Intel Corporation, licensed under
Apache-2.0. The packaging in this repository is also Apache-2.0; see
[LICENSE](LICENSE) and [NOTICE](NOTICE).
