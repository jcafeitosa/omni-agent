#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[validate] checking required governance files"
required_files=(
  "README.md"
  "LICENSE"
  "CONTRIBUTING.md"
  "CODE_OF_CONDUCT.md"
  "SECURITY.md"
  "SUPPORT.md"
  "CHANGELOG.md"
  ".github/CODEOWNERS"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[validate] missing required file: $file"
    exit 1
  fi
done

echo "[validate] running build"
npm run build

echo "[validate] running tests"
npm test

echo "[validate] repository validation completed successfully"
