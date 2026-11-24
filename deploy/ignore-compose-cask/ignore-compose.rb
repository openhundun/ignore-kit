cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.0.1"
  sha256 arm:          "86a39624459b13e65edde20df11ab321a8dc6b2700e02411b90ebcde9765b3df",
         intel:        "6d6ce04e3f4f6140d816e308818e29df45ebea522806e1dd43aee074d12e1a73",
         arm64_linux:  "949d4fb91bd91ba86cbb0fc55a163bc1d69cfa27e576855aa3fedd67d665b039",
         x86_64_linux: "80ff0b401a52d6a518f223ca618a810a19c7648260bb0e50b61e7be530b7abd8"

  url "https://github.com/openhundun/ignore-kit/releases/download/latest/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
