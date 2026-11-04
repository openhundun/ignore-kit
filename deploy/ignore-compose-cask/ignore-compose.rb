cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.1.0"
  sha256 arm:          "082eb692a4132ab0445683e5fbf6a39d4758f92d12e3070f3e559b4aebfddbb6",
         intel:        "2c4c8fefaa02bc12f80a23ec359bf477020685310288099f7d9f02df3d07d67d",
         arm64_linux:  "2febf96544de57fc2a5a7022fad0278cc11bc78cd201185961290433274668d6",
         x86_64_linux: "533ce91149cd65ae4ac38265c698661be94a8c65e8ca7d08d898cb6c9125af43"

  url "https://github.com/openhundun/ignore-kit/releases/download/v#{version}/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  desc "Compose ignore files from upstream templates with per-line overrides"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
