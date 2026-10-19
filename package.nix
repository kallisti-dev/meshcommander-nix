{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  fetchurl,
  nodejs,
}:

buildNpmPackage (finalAttrs: {
  pname = "meshcommander";
  version = "0.9.5-a-unstable-2026-07-28";

  # The Node.js server is published only to npm.
  src = fetchurl {
    url = "https://registry.npmjs.org/meshcommander/-/meshcommander-0.9.5-a.tgz";
    hash = "sha256-NbF/MAFGg0bRSjEmKuQAiIN6LG5RccCl1gNqFDbJsPU=";
  };

  # The web interface source, compiled into public/ during the build.
  webSrc = fetchFromGitHub {
    owner = "Ylianst";
    repo = "MeshCommander";
    rev = "1cd156ba8740c624bfc458e45535e3da79cbc2bf";
    hash = "sha256-SPV6zNrAUM2JNdWigIcvdxsNeWWgyRZSgzVQM4R6vpM=";
  };

  patches = [
    # express-ws 2 pins ws 1.x, which has known vulnerabilities; ws 3 removed
    # the upgradeReq API the relay used.
    ./patches/ws8.patch
    # Upstream added ECDHE suites to its own Node.js TLS clients in 2025; the
    # npm server still offered only RSA key exchange.
    ./patches/ecdhe-ciphers.patch
    # Dependencies come from the package; never run npm install at startup.
    ./patches/no-runtime-install.patch
  ];

  # The npm tarball ships no lockfile.
  postPatch = ''
    cp ${./package-lock.json} package-lock.json
  '';

  npmDepsHash = "sha256-bDo65wAkwLegcnDGgUjhLYtnluRHbAIkOaHHlS4PN7Y=";

  buildPhase = ''
    runHook preBuild

    rm public/*.htm
    node ${./compile-ui.mjs} ${finalAttrs.webSrc} public
    rm -r public/images-commander
    cp -r ${finalAttrs.webSrc}/images-commander public/
    cp ${finalAttrs.webSrc}/scriptblocks.txt public/

    runHook postBuild
  '';

  meta = {
    description = "Web console for Intel AMT remote desktop, serial-over-LAN, IDE redirection and power control";
    homepage = "https://github.com/Ylianst/MeshCommander";
    license = lib.licenses.asl20;
    mainProgram = "meshcommander";
    inherit (nodejs.meta) platforms;
  };
})
