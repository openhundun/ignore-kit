#!/usr/bin/env bash
set -euo pipefail

readonly ARG_JOB="${1:-}"
readonly ARG_STEP="${2:-}"
readonly ARG_TARGET="${3:-}"
readonly GIT_REPOSITORY_DIR="${GIT_REPOSITORY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly APP_NAME="ignore-compose"
readonly DIST="${GIT_REPOSITORY_DIR}/source/${APP_NAME}-cli/dist"

function help() {
    echo "USAGE: ${0} <job__check|job__contract|job__vendor|job__web|job__package|job__release> [step__xxx] [target]"
}

function version() {
    cargo metadata --manifest-path "${GIT_REPOSITORY_DIR}/Cargo.toml" --no-deps --format-version 1 | jq -r '.packages[] | select(.name == "ignore-compose-cli") | .version'
}

function job__check() {
    function step__compile() {
        cd "${GIT_REPOSITORY_DIR}"
        cargo check --workspace
    }

    function step__fmt() {
        cd "${GIT_REPOSITORY_DIR}"
        cargo fmt --all -- --check
    }

    function step__clippy() {
        cd "${GIT_REPOSITORY_DIR}"
        cargo clippy --workspace --all-targets -- -D warnings
    }

    function step__wasm() {
        cd "${GIT_REPOSITORY_DIR}"
        cargo build --release -p ignore-compose-lib --target wasm32-unknown-unknown
    }

    function step__web() {
        cd "${GIT_REPOSITORY_DIR}/source/${APP_NAME}-web"
        bun install --no-save
        bunx tsc --noEmit
    }

    function all() {
        step__compile
        step__wasm
        step__web
    }

    case "${ARG_STEP}" in
    step__compile) step__compile ;;
    step__fmt) step__fmt ;;
    step__clippy) step__clippy ;;
    step__wasm) step__wasm ;;
    step__web) step__web ;;
    *) all ;;
    esac
}

function job__contract() {
    function step__write() {
        cd "${GIT_REPOSITORY_DIR}"
        mkdir -p deploy
        cargo run --quiet -p ignore-compose-cli -- schema > deploy/ignore-compose.schema.json
        cargo run --quiet -p ignore-compose-cli -- dts > deploy/ignore-compose.d.ts
    }

    function all() {
        step__write
    }

    case "${ARG_STEP}" in
    step__write) step__write ;;
    *) all ;;
    esac
}

function job__web() {
    function step__wasm() {
        cd "${GIT_REPOSITORY_DIR}"
        cargo build --release -p ignore-compose-lib --target wasm32-unknown-unknown
        mkdir -p "source/${APP_NAME}-web/public"
        cp "target/wasm32-unknown-unknown/release/ignore_compose_lib.wasm" "source/${APP_NAME}-web/public/ignore_compose.wasm"
    }

    function step__vendor() {
        local target="${GIT_REPOSITORY_DIR}/source/${APP_NAME}-web/public/vendor"
        rm -rf "${target}"
        mkdir -p "${target}"
        cp -R "${GIT_REPOSITORY_DIR}/vendor/raw.githubusercontent.com" "${target}/"
    }

    function step__dist() {
        step__vendor
        cd "${GIT_REPOSITORY_DIR}/source/${APP_NAME}-web"
        bun install --no-save
        bun run build
        [[ -f dist/index.html ]] || {
            echo "error: missing ${PWD}/dist/index.html" >&2
            return 1
        }
        [[ -f dist/ignore_compose.wasm ]] || {
            echo "error: missing ${PWD}/dist/ignore_compose.wasm" >&2
            return 1
        }
        [[ -n "$(find dist/assets -maxdepth 1 -name "*.js" -print -quit)" ]] || {
            echo "error: missing bundled assets in ${PWD}/dist/assets" >&2
            return 1
        }
        echo "web build ok: ${PWD}/dist"
    }

    function all() {
        step__wasm
        step__dist
    }

    case "${ARG_STEP}" in
    step__wasm) step__wasm ;;
    step__vendor) step__vendor ;;
    step__dist) step__dist ;;
    *) all ;;
    esac
}

function job__package() {
    function step__build() {
        local target="${1:-${ARG_TARGET:?target is required}}"
        cd "${GIT_REPOSITORY_DIR}"
        env "CC_x86_64_unknown_linux_musl=musl-gcc" "CC_aarch64_unknown_linux_musl=musl-gcc" cargo build --release -p ignore-compose-cli --target "${target}"
    }

    function step__archive() {
        local target="${1:-${ARG_TARGET:?target is required}}"
        local binary="${GIT_REPOSITORY_DIR}/target/${target}/release/${APP_NAME}"
        [[ -x "${binary}" ]] || return 1
        mkdir -p "${DIST}/stage/${target}"
        cp "${binary}" "${DIST}/stage/${target}/${APP_NAME}"
        chmod 755 "${DIST}/stage/${target}/${APP_NAME}"
        tar -czf "${DIST}/${APP_NAME}-${target}.tar.gz" -C "${DIST}/stage/${target}" "${APP_NAME}"
    }

    function step__release() {
        cd "${GIT_REPOSITORY_DIR}"
        gh release view latest > /dev/null 2>&1 || gh release create latest --title latest --notes "$(git rev-parse HEAD)" --target "$(git rev-parse HEAD)"
        gh release upload latest "${DIST}"/*.tar.gz --clobber
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
        cd "${GIT_REPOSITORY_DIR}"
        env "CC_${target_cc_env}=${cc_wrapper}" "CXX_${target_cc_env}=${cxx_wrapper}" "AR_${target_cc_env}=${ar_wrapper}" "CARGO_TARGET_${target_env}_LINKER=${cc_wrapper}" RUSTFLAGS="-C link-self-contained=no" cargo build --release -p ignore-compose-cli --target "${target}"
        step__archive "${target}"
    }

    function all() {
        [[ "$(uname -s)" == "Darwin" ]] || {
            echo "error: packaging requires a macOS host" >&2
            return 1
        }
        command -v zig > /dev/null || {
            echo "error: zig is required for the Linux musl targets" >&2
            return 1
        }
        TMP_DIR="$(mktemp -d)"
        trap 'rm -rf "${TMP_DIR}"' EXIT
        step__build aarch64-apple-darwin
        step__archive aarch64-apple-darwin
        step__build x86_64-apple-darwin
        step__archive x86_64-apple-darwin
        step__build_linux x86_64-unknown-linux-musl x86_64-linux-musl
        step__build_linux aarch64-unknown-linux-musl aarch64-linux-musl
    }

    case "${ARG_STEP}" in
    step__build) step__build ;;
    step__archive) step__archive ;;
    step__release) step__release ;;
    *) all ;;
    esac
}

function job__vendor() {
    local vendor_source="github/gitignore"
    local vendor_ref="main"
    local vendor_dir="${GIT_REPOSITORY_DIR}/vendor"
    local vendor_templates="${vendor_dir}/raw.githubusercontent.com/${vendor_source}/${vendor_ref}"
    local vendor_metadata="${vendor_dir}/github-gitignore.json"

    function step__sync() {
        local commit="${GITIGNORE_COMMIT:-$(git ls-remote "https://github.com/${vendor_source}.git" "refs/heads/${vendor_ref}" | awk 'NR == 1 { print $1 }')}"
        [[ "${commit}" =~ ^[0-9a-f]{40}$ ]] || {
            echo "error: cannot resolve ${vendor_source}@${vendor_ref}" >&2
            return 1
        }
        local temp_dir
        temp_dir="$(mktemp -d)"
        trap 'rm -rf "${temp_dir}"' EXIT
        curl --fail --silent --show-error --location \
            "https://codeload.github.com/${vendor_source}/tar.gz/${commit}" \
            --output "${temp_dir}/source.tar.gz"
        tar -xzf "${temp_dir}/source.tar.gz" -C "${temp_dir}"
        local source_dir
        source_dir="$(find "${temp_dir}" -mindepth 1 -maxdepth 1 -type d -print -quit)"
        [[ -n "${source_dir}" ]] || {
            echo "error: empty ${vendor_source} archive" >&2
            return 1
        }
        local staging="${temp_dir}/templates"
        mkdir -p "${staging}"
        local count=0
        while IFS= read -r -d '' file; do
            local relative="${file#"${source_dir}"/}"
            mkdir -p "$(dirname "${staging}/${relative}")"
            cp "${file}" "${staging}/${relative}"
            count=$((count + 1))
        done < <(find "${source_dir}" \( -type f -o -type l \) -name '*.gitignore' -print0)
        rm -rf "${vendor_templates}"
        mkdir -p "$(dirname "${vendor_templates}")"
        mv "${staging}" "${vendor_templates}"
        cp "${source_dir}/LICENSE" "${vendor_dir}/github-gitignore.LICENSE"
        jq -n \
            --arg commit "${commit}" \
            --arg ref "${vendor_ref}" \
            --arg repository "https://github.com/${vendor_source}" \
            --argjson templates "${count}" \
            '{commit: $commit, ref: $ref, repository: $repository, templates: $templates}' > "${vendor_metadata}"
        echo "vendor updated: ${vendor_source}@${commit} (${count} templates)"
    }

    function step__verify() {
        [[ -f "${vendor_metadata}" ]] || {
            echo "error: missing ${vendor_metadata}" >&2
            return 1
        }
        local commit
        commit="$(jq -r '.commit' "${vendor_metadata}")"
        [[ "${commit}" =~ ^[0-9a-f]{40}$ ]] || {
            echo "error: invalid commit in ${vendor_metadata}" >&2
            return 1
        }
        local expected
        expected="$(jq -r '.templates' "${vendor_metadata}")"
        local actual
        actual="$(find "${vendor_templates}" -type f -name '*.gitignore' | wc -l | tr -d ' ')"
        [[ "${expected}" == "${actual}" ]] || {
            echo "error: vendor template count ${actual}, expected ${expected}" >&2
            return 1
        }
        echo "vendor ok: ${vendor_source}@${commit} (${actual} templates)"
    }

    case "${ARG_STEP}" in
    step__sync) step__sync ;;
    step__verify) step__verify ;;
    *)
        echo "USAGE: ${0} job__vendor <step__sync|step__verify>" >&2
        return 1
        ;;
    esac
}

function job__release() {
    local package_version="$(version)"
    local tag="latest"
    job__package
    if gh release view "${tag}" > /dev/null 2>&1; then
        gh release upload "${tag}" "${DIST}"/*.tar.gz --clobber
    else
        gh release create "${tag}" "${DIST}"/*.tar.gz --title "${tag}" --notes "${APP_NAME} ${package_version}"
    fi
}

case "${ARG_JOB}" in
job__check) job__check ;;
job__contract) job__contract ;;
job__vendor) job__vendor ;;
job__web) job__web ;;
job__package) job__package ;;
job__release) job__release ;;
*) help ;;
esac
