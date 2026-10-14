{
  description = "Standalone MeshCommander with a pinned modern WebSocket runtime";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          meshcommander = pkgs.callPackage ./package.nix { };
        in
        {
          inherit meshcommander;
          default = meshcommander;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.meshcommander}/bin/meshcommander";
          meta.description = "Run the MeshCommander web console on loopback";
        };
      });

      checks = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          package = self.packages.${system}.meshcommander;
        in
        {
          inherit package;
          source = pkgs.runCommand "meshcommander-source-check" { nativeBuildInputs = [ pkgs.nodejs_24 ]; } ''
            node ${./tests/source.mjs} ${package}/lib/node_modules/meshcommander
            touch $out
          '';
          runtime =
            pkgs.runCommand "meshcommander-runtime-check"
              {
                nativeBuildInputs = [ pkgs.nodejs_24 ];
                __darwinAllowLocalNetworking = true;
              }
              ''
                node ${./tests/runtime.mjs} ${package}/bin/meshcommander ${package}/lib/node_modules/meshcommander
                touch $out
              '';
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.nixfmt
              pkgs.prefetch-npm-deps
            ];
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}
