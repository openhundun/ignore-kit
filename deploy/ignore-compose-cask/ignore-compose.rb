cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.0.1"
  sha256 arm:          "68c93f3c885fc6a4120a801180dc8a2d460a622544ceaa33e4aea46180248880",
         intel:        "c993fcc8d3d2e267c64e7d178ff2890f69a00e797037bd6713312fe2677384b9",
         arm64_linux:  "2191b9b768f7082e6549d1666fb6e5a2584635563f878b637369e2665c8f55b9",
         x86_64_linux: "bd75937f3385736845dd98b8c69974b40a25f07bf14a668652acabd1b8683ede"

  url "https://github.com/openhundun/ignore-kit/releases/download/latest/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
