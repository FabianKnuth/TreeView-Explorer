#!/bin/bash
set -e

# Create temp directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Detect OS
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  # macOS
  DOWNLOAD_URL="https://github.com/aknuth/TreeView-Explorer/releases/latest/download/dtv"
else
  # Linux (default)
  DOWNLOAD_URL="https://github.com/aknuth/TreeView-Explorer/releases/latest/download/dtv"
fi

# Download and run
curl -L "$DOWNLOAD_URL" -o TreeView-Explorer
chmod +x TreeView-Explorer
./dtv "$@"

# Clean up
rm -rf "$TMP_DIR"