{
    lib,
    rustPlatform,
    git,
}:
rustPlatform.buildRustPackage {
    pname = "ignore-compose";
    version = "0.1.0";

    src = lib.cleanSourceWith {
        src = ../..;
        filter = path: type:
            lib.cleanSourceFilter path type
            && builtins.baseNameOf path != "target"
            && builtins.baseNameOf path != "node_modules";
    };

    cargoRoot = ".";
    cargoLock.lockFile = ../../Cargo.lock;

    nativeBuildInputs = [git];

    meta = {
        description = "Compose ignore files from upstream templates with per-line overrides";
        homepage = "https://github.com/openhundun/ignore-kit";
        license = lib.licenses.mit;
        mainProgram = "ignore-compose";
    };
}
