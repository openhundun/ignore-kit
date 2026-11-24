cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.0.1"
  sha256 arm:          "99d50c9fa2a5916c15f4b4a8c66ae776c0bbcfcf3c8b889e3a4bf0492dfdb60c",
         intel:        "ddaeaf18cb0e78ed0fcbe377cecb771949c95f2b11e69ea5438715fc691ff694",
         arm64_linux:  "b78ff33d0e6327dc2a9e30e6d100e1b204d8caf9d5a9ddc67c4e94e4cf36038c",
         x86_64_linux: "b643467f893de75340bacce5cc54071c2dd6715bc8727c97bca6bcc54a4d5f20"

  url "https://github.com/openhundun/ignore-kit/releases/download/latest/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
