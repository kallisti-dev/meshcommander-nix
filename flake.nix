{
  description = "MeshCommander, the Intel AMT web console, built from current upstream source";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      forAllSystems =
        f:
        lib.genAttrs [
          "aarch64-darwin"
          "aarch64-linux"
          "x86_64-linux"
        ] (system: f nixpkgs.legacyPackages.${system});
    in
    {
      overlays.default = final: _prev: {
        meshcommander = final.callPackage ./package.nix { };
      };

      packages = forAllSystems (pkgs: {
        meshcommander = pkgs.callPackage ./package.nix { };
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.meshcommander;
      });

      checks = forAllSystems (
        pkgs:
        let
          package = self.packages.${pkgs.stdenv.hostPlatform.system}.meshcommander;
        in
        {
          inherit package;

          runtime =
            pkgs.runCommand "meshcommander-runtime-check"
              {
                nativeBuildInputs = [
                  pkgs.nodejs
                  pkgs.openssl
                ];
                __darwinAllowLocalNetworking = true;
              }
              ''
                openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
                  -keyout key.pem -out cert.pem 2>/dev/null
                node ${./tests/runtime.mjs} ${lib.getExe package} \
                  ${package}/lib/node_modules/meshcommander key.pem cert.pem
                touch $out
              '';

          # Rebuilds the pages published in the npm tarball from the upstream
          # commit they were compiled from, and compares them with the originals.
          web-compiler =
            pkgs.runCommand "meshcommander-web-compiler-check"
              {
                nativeBuildInputs = [
                  pkgs.nodejs
                  (pkgs.python3.withPackages (ps: [ ps.html5lib ]))
                ];
                webSrc = pkgs.fetchFromGitHub {
                  owner = "Ylianst";
                  repo = "MeshCommander";
                  rev = "3fd373c9060603fa432168f1a779e107623b4154";
                  hash = "sha256-KKfyjbJcaHyyLdcp4CaIPnZho6pMCkLc3Lkv904wrgQ=";
                };
              }
              ''
                tar -xzf ${package.src} package/public
                node ${./compile-ui.mjs} "$webSrc" compiled
                python3 ${./tests/compare-pages.py} package/public compiled
                touch $out
              '';
        }
      );

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.nixfmt
            pkgs.prefetch-npm-deps
          ];
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
