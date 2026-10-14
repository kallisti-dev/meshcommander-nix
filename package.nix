{
  lib,
  buildNpmPackage,
  fetchurl,
  nodejs_24,
}:

buildNpmPackage {
  pname = "meshcommander";
  version = "0.9.5-a";
  nodejs = nodejs_24;

  src = fetchurl {
    url = "https://registry.npmjs.org/meshcommander/-/meshcommander-0.9.5-a.tgz";
    hash = "sha256-NbF/MAFGg0bRSjEmKuQAiIN6LG5RccCl1gNqFDbJsPU=";
  };

  postPatch = ''
    ${nodejs_24}/bin/node ${./scripts/patch-source.mjs} .
    cp ${./package-lock.json} package-lock.json
  '';

  npmDepsHash = "sha256-bDo65wAkwLegcnDGgUjhLYtnluRHbAIkOaHHlS4PN7Y=";
  dontNpmBuild = true;
  npmFlags = [ "--ignore-scripts" ];

  meta = {
    description = "Browser-based Intel AMT management console";
    homepage = "https://github.com/Ylianst/MeshCommander";
    license = lib.licenses.asl20;
    mainProgram = "meshcommander";
    platforms = [
      "aarch64-darwin"
      "x86_64-linux"
    ];
  };
}
