# Tachibana Build System
# Run `just --list` to see all available commands

# Configuration
bun := "bun"
bunx := "bunx"
root_dir := replace(justfile_directory(), "\\", "/")
apps_dir := root_dir / "apps"
packages_dir := root_dir / "packages"

# sharp and its native bindings must stay external so the compiled binary loads them from disk
sharp_externals := "--external sharp --external @img/sharp-darwin-arm64 --external @img/sharp-darwin-x64 --external @img/sharp-linux-arm --external @img/sharp-linux-arm64 --external @img/sharp-linux-x64 --external @img/sharp-linuxmusl-arm64 --external @img/sharp-linuxmusl-x64 --external @img/sharp-linux-ppc64 --external @img/sharp-linux-riscv64 --external @img/sharp-linux-s390x --external @img/sharp-win32-arm64 --external @img/sharp-win32-ia32 --external @img/sharp-win32-x64 --external @img/sharp-wasm32 --external @img/sharp-libvips-darwin-arm64 --external @img/sharp-libvips-darwin-x64 --external @img/sharp-libvips-linux-arm --external @img/sharp-libvips-linux-arm64 --external @img/sharp-libvips-linux-x64 --external @img/sharp-libvips-linuxmusl-arm64 --external @img/sharp-libvips-linuxmusl-x64 --external @img/sharp-libvips-linux-ppc64 --external @img/sharp-libvips-linux-riscv64 --external @img/sharp-libvips-linux-s390x"

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

# Build server binary (depends on web build)
build: build-web typecheck
    @echo "→ Building server..."
    cd {{apps_dir}}/server && {{bun}} build src/index.ts --compile --external vite {{sharp_externals}} --outfile dist/tachibana
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
    mkdir -p "${staging}/bin" "${staging}/drizzle" "${staging}/web" "${staging}/node_modules"

    # Server binary
    cp "{{apps_dir}}/server/dist/tachibana" "${staging}/"

    # go-ios binary + DDI
    [ -d "{{apps_dir}}/server/bin" ] && cp -r "{{apps_dir}}/server/bin/"* "${staging}/bin/"

    # Drizzle migrations
    cp -r "{{apps_dir}}/server/drizzle/"* "${staging}/drizzle/"

    # Web frontend
    cp -r "{{apps_dir}}/web/dist/"* "${staging}/web/"

    # Sharp + deps (resolved from disk at runtime)
    for pkg in sharp detect-libc semver; do
      [ -d "${srv_nm}/$pkg" ] && cp -r "${srv_nm}/$pkg" "${staging}/node_modules/"
    done
    mkdir -p "${staging}/node_modules/@img"
    # Copy @img packages from bun's internal cache
    for dir in "${bun_cache}"/@img+sharp-*/; do
      [ -d "$dir" ] && cp -r "$dir"/node_modules/@img/* "${staging}/node_modules/@img/"
    done
    # Also copy any @img packages from standard node_modules locations
    for nm in "${srv_nm}" "${root}/node_modules"; do
      for dir in "${nm}"/@img/colour "${nm}"/@img/sharp-* "${nm}"/@img/sharp-libvips-*; do
        [ -d "$dir" ] && cp -r "$dir" "${staging}/node_modules/@img/"
      done
    done

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
