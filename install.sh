#!/bin/bash
set -e

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

# Set download URL based on OS and architecture
if [ "$OS" = "Linux" ]; then
  # Linux
  DOWNLOAD_URL="https://github.com/aknuth/TreeView-Explorer/releases/latest/download/dtv"
else
  echo "Unsupported operating system: $OS"
  exit 1
fi

# Download location
INSTALL_DIR="$HOME/.local/bin"
BINARY_PATH="$INSTALL_DIR/dtv"

# Create directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Download binary
echo "Downloading directory explorer..."
curl -L "$DOWNLOAD_URL" -o "$BINARY_PATH"

# Make binary executable
chmod +x "$BINARY_PATH"

# Add to PATH if needed
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo "Adding $INSTALL_DIR to PATH in your profile..."
  if [ -f "$HOME/.zshrc" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    echo "Please run 'source $HOME/.zshrc' or start a new terminal session"
  elif [ -f "$HOME/.bashrc" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    echo "Please run 'source $HOME/.bashrc' or start a new terminal session"
  else
    echo "Could not find shell configuration file. Please add $INSTALL_DIR to your PATH manually."
  fi
fi

echo "Directory Explorer installed successfully! Run 'directory-explorer' to start."