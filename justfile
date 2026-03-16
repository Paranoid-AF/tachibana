# Tachibana Build System
# Run `just --list` to see all available commands

# Configuration
bun := "bun"
bunx := "bunx"
root_dir := replace(justfile_directory(), "\\", "/")
apps_dir := root_dir / "apps"
packages_dir := root_dir / "packages"
windows_icon := if os() == "windows" { "--windows-icon=" + root_dir / ".packaging/icon.ico" } else { "" }


# Default target - show available commands
default: list

#############################################
# Development
#############################################

# Run server in development mode (Vite integrated)
dev:
    @echo "Starting server..."
    cd {{apps_dir}}/server && {{bun}} run dev

# Install all dependencies
install: _check-native-deps
    @echo "Installing dependencies..."
    {{bun}} install
    @echo "Building ios-connect native daemon..."
    cd {{packages_dir}}/ios-connect && {{bun}} run scripts/build-native.ts

#############################################
# Building
#############################################

# Build web frontend
build-web:
    @echo "→ Building web..."
    cd {{apps_dir}}/web && {{bunx}} vite build
    @echo "✓ Web built"

# Build CLI binary
build-cli:
    @echo "→ Building CLI..."
    cd {{apps_dir}}/cli && {{bun}} run build
    @echo "✓ CLI built"

# Build server binary (depends on web + CLI build)
build: build-web build-cli typecheck
    @echo "→ Building server..."
    cd {{apps_dir}}/server && {{bun}} build src/index.ts --compile --external vite {{windows_icon}} --outfile dist/tachibana
    @echo "✓ Server built"

#############################################
# Type checking
#############################################

# Typecheck everything
typecheck:
    @echo "  Type-checking packages..."
    cd {{packages_dir}}/ios-connect && {{bunx}} tsc --noEmit
    cd {{packages_dir}}/ios-wda && {{bunx}} tsc --noEmit
    @echo "  Type-checking apps..."
    cd {{apps_dir}}/cli && {{bunx}} tsc --noEmit
    cd {{apps_dir}}/server && {{bunx}} tsc --noEmit
    cd {{apps_dir}}/web && {{bunx}} tsc --noEmit
    @echo "✓ All type checks passed!"

#############################################
# Code quality
#############################################

# Run linter
lint:
    @echo "Running linter..."
    {{bunx}} oxlint --import-plugin --tsconfig ./tsconfig.json .

# Format code
format:
    @echo "Formatting code..."
    {{bunx}} oxfmt --write .

# Run all checks (lint + format)
check: lint typecheck format
    @echo ""
    @echo "✓ All checks passed!"

# Build a distributable staging directory (emulates CI build locally)
build-dist: build
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{root_dir}}"
    srv_nm="{{apps_dir}}/server/node_modules"
    bun_cache="${root}/node_modules/.bun"
    staging="${root}/staging/tachibana"
    rm -rf "${staging}"
    mkdir -p "${staging}/bin" "${staging}/drizzle" "${staging}/web"

    # Server binary
    cp "{{apps_dir}}/server/dist/tachibana" "${staging}/"

    # CLI binary
    cp "{{apps_dir}}/cli/dist/tachibana-cli.js" "${staging}/" 2>/dev/null || true

    # go-ios binary + DDI
    [ -d "{{apps_dir}}/server/bin" ] && cp -r "{{apps_dir}}/server/bin/"* "${staging}/bin/"

    # Drizzle migrations
    cp -r "{{apps_dir}}/server/drizzle/"* "${staging}/drizzle/"

    # Web frontend
    cp -r "{{apps_dir}}/web/dist/"* "${staging}/web/"

    # Sharp native binding + libvips (only native files needed; sharp JS is bundled)
    platform="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')"
    sharp_dir="${staging}/sharp/@img"
    mkdir -p "${sharp_dir}"
    # Copy platform-specific @img/sharp-<platform> (contains .node binding)
    for dir in "${bun_cache}"/@img+sharp-${platform}@*/node_modules/@img/sharp-${platform}; do
      [ -d "$dir" ] && cp -r "$dir" "${sharp_dir}/" && break
    done
    for nm in "${srv_nm}" "${root}/node_modules"; do
      [ -d "${nm}/@img/sharp-${platform}" ] && cp -r "${nm}/@img/sharp-${platform}" "${sharp_dir}/" && break
    done
    # Copy platform-specific @img/sharp-libvips-<platform> (contains libvips dylib)
    for dir in "${bun_cache}"/@img+sharp-libvips-${platform}@*/node_modules/@img/sharp-libvips-${platform}; do
      [ -d "$dir" ] && cp -r "$dir" "${sharp_dir}/" && break
    done
    for nm in "${srv_nm}" "${root}/node_modules"; do
      [ -d "${nm}/@img/sharp-libvips-${platform}" ] && cp -r "${nm}/@img/sharp-libvips-${platform}" "${sharp_dir}/" && break
    done

    # ios-connect native addon (napi-rs loader + .node binding)
    ic_dist="{{packages_dir}}/ios-connect/dist"
    ic_staging="${staging}/ios-connect/dist"
    mkdir -p "${ic_staging}"
    cp "${ic_dist}/index.js" "${ic_staging}/"
    cp "${ic_dist}/"*.node "${ic_staging}/"

    # WDA IPA (if available)
    ipa="{{packages_dir}}/ios-wda/ipa-build/WebDriverAgentRunner.ipa"
    if [ -f "$ipa" ]; then
      mkdir -p "${staging}/assets"
      cp "$ipa" "${staging}/assets/"
    fi

    chmod +x "${staging}/tachibana" 2>/dev/null || true

    chmod +x "${staging}/bin/ios" 2>/dev/null || true

    echo "✓ Staging directory ready at: ${staging}"
    echo "  Run with: ${staging}/tachibana"

#############################################
# Cleanup
#############################################

# Remove all build artifacts
clean:
    @echo "Cleaning build artifacts..."
    rm -rf {{apps_dir}}/server/dist
    rm -rf {{apps_dir}}/web/dist
    rm -rf {{packages_dir}}/ios-connect/dist
    rm -rf {{packages_dir}}/ios-wda/dist
    rm -rf {{root_dir}}/staging
    @echo "✓ Clean complete"

#############################################
# Internal helpers
#############################################

# Check that native build dependencies are available
[private]
_check-native-deps:
    #!/usr/bin/env bash
    if ! command -v cargo &>/dev/null; then
        echo "⚠  Rust toolchain (cargo) not found — needed for ios-connect native daemon"
        echo "   Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    fi

#############################################
# Utilities
#############################################

# List all available recipes
list:
    @just --list --unsorted

# Show this help message with descriptions
help:
    @echo "Tachibana Build System"
    @echo ""
    @echo "Common commands:"
    @echo "  just dev              - Run server in dev mode (Vite integrated)"
    @echo "  just build            - Build server binary (includes web build)"
    @echo "  just build-dist       - Build distributable staging directory"
    @echo "  just build-web        - Build web frontend"
    @echo "  just typecheck        - Run all type checks"
    @echo "  just lint             - Run linter"
    @echo "  just format           - Format code"
    @echo "  just check            - Run all checks (lint + typecheck + format)"
    @echo "  just clean            - Remove build artifacts"
    @echo ""
    @echo "Run 'just --list' to see all available commands"
