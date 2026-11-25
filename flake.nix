{
  description = "Development shell for Pitfight";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      # Nixpkgs 26.11 (nixpkgs-unstable) dropped x86_64-darwin support.
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.flyctl
              pkgs.gh
              pkgs.nodejs_26
              pkgs.prek
              pkgs.python313
              pkgs.shellcheck
              pkgs.shfmt
              pkgs.sqlite
              pkgs.uv
            ];
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);
    };
}
