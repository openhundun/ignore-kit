#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DIST="${ROOT}/source/ignore-compose-cli/dist"
readonly CASK_FILE="${ROOT}/deploy/ignore-compose-cask/ignore-compose.rb"

function help() {
    echo "usage: ${0} {check|contract|web|package|cask|release}"
    echo "       ${0} -h | --help"
}

function version() {
    cargo metadata --manifest-path "${ROOT}/Cargo.toml" --no-deps --format-version 1 | jq -r '.packages[] | select(.name == "ignore-compose-cli") | .version'
}

function step__check_fmt() {
    cd "${ROOT}" || return 1
    cargo fmt --all -- --check
}

function step__check_clippy() {
    cd "${ROOT}" || return 1
    cargo clippy --workspace --all-targets -- -D warnings
}

function step__check_wasm() {
    cd "${ROOT}" || return 1
    cargo build --release -p ignore-compose-wasm --target wasm32-unknown-unknown
}

function job__check() {
    step__check_fmt
    step__check_clippy
    step__check_wasm
}

function job__contract() {
    cd "${ROOT}" || return 1
    cargo run --quiet -p ignore-compose-common --features contract --bin ignore-compose-contract
}

function job__web() {
    cd "${ROOT}" || return 1
    local dist="${ROOT}/source/ignore-compose-web/dist"
    cargo build --release -p ignore-compose-wasm --target wasm32-unknown-unknown
    mkdir -p "${dist}"
    cp "${ROOT}/source/ignore-compose-wasm/index.js" "${dist}/index.js"
    cp "${ROOT}/target/wasm32-unknown-unknown/release/ignore_compose_wasm.wasm" "${dist}/ignore_compose.wasm"
    cp "${ROOT}/source/ignore-compose-web/index.html" "${dist}/index.html"
    cp "${ROOT}/source/ignore-compose-web/app.js" "${dist}/app.js"
    cp "${ROOT}/source/ignore-compose-web/style.css" "${dist}/style.css"
}

function step__archive() {
    local target="${1}"
    local binary="${ROOT}/target/${target}/release/ignore-compose"
    [[ -x "${binary}" ]] || return 1
    mkdir -p "${DIST}/stage/${target}"
    cp "${binary}" "${DIST}/stage/${target}/ignore-compose"
    chmod 755 "${DIST}/stage/${target}/ignore-compose"
    tar -czf "${DIST}/ignore-compose-${target}.tar.gz" -C "${DIST}/stage/${target}" ignore-compose
}

function step__write_zig_wrapper() {
    local wrapper="${1}"
    local zig_target="${2}"
    local compiler="${3}"
    local filter_cortex="${4}"
    {
        echo '#!/usr/bin/env bash'
        echo 'set -euo pipefail'
        echo 'arg_list=()'
        echo 'for arg in "${@}"; do'
        echo '    case "${arg}" in'
        echo '    --target=*) ;;'
        if [[ "${filter_cortex}" == "true" ]]; then
            echo '    -Wl,--fix-cortex-a53-843419) ;;'
        fi
        echo '    *) arg_list+=("${arg}") ;;'
        echo '    esac'
        echo 'done'
        if [[ "${compiler}" == "ar" ]]; then
            echo "exec $(command -v zig) ar \"\${arg_list[@]}\""
        else
            echo "exec $(command -v zig) ${compiler} -target ${zig_target} \"\${arg_list[@]}\""
        fi
    } | tee "${wrapper}" > /dev/null
    chmod 755 "${wrapper}"
}

function step__build_linux() {
    local target="${1}"
    local zig_target="${2}"
    local target_env="$(printf '%s' "${target}" | tr '-' '_' | tr '[:lower:]' '[:upper:]')"
    local target_cc_env="$(printf '%s' "${target}" | tr '-' '_')"
    local cc_wrapper="${TMP_DIR}/zig-cc-${target}"
    local cxx_wrapper="${TMP_DIR}/zig-cxx-${target}"
    local ar_wrapper="${TMP_DIR}/zig-ar-${target}"
    local filter_cortex="false"
    if [[ "${target}" == aarch64-* ]]; then
        filter_cortex="true"
    fi
    step__write_zig_wrapper "${cc_wrapper}" "${zig_target}" "cc" "${filter_cortex}"
    step__write_zig_wrapper "${cxx_wrapper}" "${zig_target}" "c++" "${filter_cortex}"
    step__write_zig_wrapper "${ar_wrapper}" "${zig_target}" "ar" "false"
    cd "${ROOT}" || return 1
    env "CC_${target_cc_env}=${cc_wrapper}" "CXX_${target_cc_env}=${cxx_wrapper}" "AR_${target_cc_env}=${ar_wrapper}" "CARGO_TARGET_${target_env}_LINKER=${cc_wrapper}" RUSTFLAGS="-C link-self-contained=no" cargo build --release -p ignore-compose-cli --target "${target}"
    step__archive "${target}"
}

function job__package() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        echo "error: packaging requires a macOS host" >&2
        return 1
    fi
    if ! command -v zig > /dev/null; then
        echo "error: zig is required for the Linux musl targets" >&2
        return 1
    fi
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "${TMP_DIR}"' EXIT
    cd "${ROOT}" || return 1
    cargo build --release -p ignore-compose-cli --target aarch64-apple-darwin
    step__archive aarch64-apple-darwin
    cargo build --release -p ignore-compose-cli --target x86_64-apple-darwin
    step__archive x86_64-apple-darwin
    step__build_linux x86_64-unknown-linux-musl x86_64-linux-musl
    step__build_linux aarch64-unknown-linux-musl aarch64-linux-musl
}

function job__cask() {
    local package_version="$(version)"
    local macos_arm64_sha="$(shasum -a 256 "${DIST}/ignore-compose-aarch64-apple-darwin.tar.gz" | cut -d' ' -f1)"
    local macos_x86_64_sha="$(shasum -a 256 "${DIST}/ignore-compose-x86_64-apple-darwin.tar.gz" | cut -d' ' -f1)"
    local linux_arm64_sha="$(shasum -a 256 "${DIST}/ignore-compose-aarch64-unknown-linux-musl.tar.gz" | cut -d' ' -f1)"
    local linux_x86_64_sha="$(shasum -a 256 "${DIST}/ignore-compose-x86_64-unknown-linux-musl.tar.gz" | cut -d' ' -f1)"
    cat > "${CASK_FILE}" << EOF
cask "ignore-compose" do
  arch arm: "aarch64", intel: "x86_64"
  os macos: "apple-darwin", linux: "unknown-linux-musl"

  version "${package_version}"
  sha256 arm:          "${macos_arm64_sha}",
         intel:        "${macos_x86_64_sha}",
         arm64_linux:  "${linux_arm64_sha}",
         x86_64_linux: "${linux_x86_64_sha}"

  url "https://github.com/openhundun/ignore-kit/releases/download/v#{version}/ignore-compose-#{arch}-#{os}.tar.gz"
  name "ignore-compose"
  desc "Compose ignore files from upstream templates with per-line overrides"
  homepage "https://github.com/openhundun/ignore-kit"

  binary "ignore-compose"
end
EOF
    echo "wrote ${CASK_FILE}"
}

function job__release() {
    local package_version="$(version)"
    local tag="v${package_version}"
    job__package
    job__cask
    if gh release view "${tag}" > /dev/null 2>&1; then
        gh release upload "${tag}" "${DIST}"/*.tar.gz "${CASK_FILE}" --clobber
    else
        gh release create "${tag}" "${DIST}"/*.tar.gz "${CASK_FILE}" --title "${tag}" --notes "ignore-compose ${package_version}"
    fi
}

case "${1:-}" in
check) job__check ;;
contract) job__contract ;;
web) job__web ;;
package) job__package ;;
cask) job__cask ;;
release) job__release ;;
*) help ;;
esac
