# Tachibana Build System
# Run `just --list` to see all available commands

# Configuration
bun := "bun"
bunx := "bunx"
root_dir := replace(justfile_directory(), "\\", "/")
apps_dir := root_dir / "apps"
packages_dir := root_dir / "packages"

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
    cd {{apps_dir}}/server && {{bun}} build src/index.ts --compile --external vite --external sharp --outfile dist/tachibana
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
    @echo "  just build     - Build server binary (includes web build)"
    @echo "  just build-web        - Build web frontend"
    @echo "  just typecheck        - Run all type checks"
    @echo "  just lint             - Run linter"
    @echo "  just format           - Format code"
    @echo "  just check            - Run all checks (lint + typecheck + format)"
    @echo "  just clean            - Remove build artifacts"
    @echo ""
    @echo "Run 'just --list' to see all available commands"
