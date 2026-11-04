{
    description = "ignore-compose: compose ignore files from upstream templates";

    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    outputs = {
        self,
        nixpkgs,
    }: let
        systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
        forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
        packages = forAllSystems (pkgs: rec {
            ignore-compose = pkgs.callPackage ./package.nix {};
            default = ignore-compose;
        });
    };
}
