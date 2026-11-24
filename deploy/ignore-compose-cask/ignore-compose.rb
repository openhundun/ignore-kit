cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.0.1"
  sha256 arm:          "b2b075cd3ec0dbe44e1e887160e42cf3afa355aa34512c7a22c9e44f0694fa0f",
         intel:        "56bd90483400cd0025351b76d707b84ece562678a054c16fce7270723d5b7328",
         arm64_linux:  "9e04a91de21d632c32d0daec00c9f186aa32b26097687edfa9048b799e87c3ec",
         x86_64_linux: "145e5af832ca4a273660355e0b8eb5ab820913deb740d0f4eb1e95533699afd6"

  url "https://github.com/openhundun/ignore-kit/releases/download/latest/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
