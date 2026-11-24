cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "0.0.1"
  sha256 arm:          "96989e9f0b505f5ddc33e6e24de551c0697e94162d8f90f172cdd3c9a60e118e",
         intel:        "a74233887c3cb01d9a35df5ee3e38f0ac6318e8caf8c22105a1b2cfbf71789c8",
         arm64_linux:  "64273d24e24b3f21c0d13e2b9d42e52704bd044f2c713893a0f32f1dc832563b",
         x86_64_linux: "b5461d0a7b73637afb0202ada03aae6010b83877ad68008707410c851937b31c"

  url "https://github.com/openhundun/ignore-kit/releases/download/latest/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
