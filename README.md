# MeshCommander

Standalone distribution of the MeshCommander 0.9.5-a web console for Intel AMT,
with a pinned Node.js dependency graph and compatibility patches. Run it with
Nix or Node.js and open the browser interface to manage an AMT host.

## Run with Nix

From this checkout:

```sh
nix run . -- --port 3000
```

Open <http://127.0.0.1:3000>. The application binds to loopback by default;
upstream's `--any` flag explicitly enables listening on other interfaces.
The relay and web UI have no access-control layer: leave it on loopback for
the workstation use case. AMT credentials and devices are entered in the UI.

Build the package with `nix build .#meshcommander`. A downstream flake can add
this repository as an input and use
`inputs.meshcommander.packages.${pkgs.stdenv.hostPlatform.system}.meshcommander`.

## Run without Nix

Use Node.js 24 with npm and a POSIX `tar` command on Linux or macOS:

```sh
node scripts/prepare-source.mjs
npm ci --prefix work --ignore-scripts --no-fund
node work/bin/meshcommander --port 3000
```

Source preparation verifies the upstream tarball's SHA-256, applies the same
compatibility changes as the Nix build, and copies the committed lockfile.
It refuses to overwrite an existing destination; an optional argument selects
a fresh destination. npm verifies the dependency integrity hashes during `ci`.

## Changes from upstream

The browser assets and AMT protocol code remain as shipped in the npm release.
The compatibility script makes three explicit changes:

- Upgrade `express-ws` to 5.0.2 and override its WebSocket dependency with
  `ws` 8.22.0. The old `ws` 1.1.5 has known vulnerabilities.
- Replace the removed `ws.upgradeReq` API with the route's request captured
  in the connection-close handler.
- Remove the runtime auto-install fallback. Dependencies must be supplied by
  the package or `npm ci`; missing dependencies fail immediately.

Every patch checks the expected upstream version and text before writing.
`package-lock.json` pins the complete dependency graph, including tarball
integrity hashes. Upstream support is discontinued; the compatibility changes
do not constitute a security audit of the application.

## Checks and support

```sh
nix flake check --print-build-logs
nix fmt -- --check flake.nix package.nix
```

The flake checks the installed command, HTTP startup and web assets, language
selection, binary WebSocket-to-TCP forwarding, and connection closure. All
connections use loopback with temporary HOME and working directories. The test
contains no AMT addresses or credentials and does not contact real devices.

The flake targets `aarch64-darwin` and `x86_64-linux`. CI is configured for
macos-15 and ubuntu-24.04.

| Platform | Verification |
| --- | --- |
| macOS ARM64 | Package and checks pass with Node.js 24.21.0 and sandboxing enabled |
| Linux x86-64 | Evaluation passes; builds and CI runs are not yet verified |

Hardware KVM, Serial-over-LAN, power operations, credentials, and legacy AMT TLS
compatibility require separate hardware validation. Windows and other
architectures are not supported by this distribution.

`nix develop` supplies Node.js 24, npm, nixfmt, and prefetch-npm-deps.
`.envrc` contains `use flake` for optional direnv use.

## Dependency updates

Use a fresh source directory and the development shell's npm. Keep the script's
pins and `package-lock.json` in sync; update the `npmDepsHash` together with the
lockfile. After changing pins, prepare a fresh source directory, generate its
lockfile with `npm install --package-lock-only --ignore-scripts`, and copy it
back here. Use `prefetch-npm-deps package-lock.json` to obtain the cache hash.
Verify `npm ci`, `npm audit`, and all flake checks before committing an update.
Audit results depend on the registry's current advisory database; an empty
report is not proof of safety.

## Attribution

MeshCommander is by Ylian Saint-Hilaire and Intel Corporation, licensed under
Apache-2.0. The upstream LICENSE is retained in the installed application.
Packaging and repository support files also use Apache-2.0. See [NOTICE](NOTICE) for
copyright notices and upstream attribution.
