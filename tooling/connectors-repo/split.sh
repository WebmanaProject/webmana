#!/usr/bin/env bash
# Assemble the standalone `webmana-connectors` repo (Apache-2.0) from this
# monorepo's SDK packages. Snapshot mode: fresh history, one extraction commit.
#
#   bash tooling/connectors-repo/split.sh [TARGET_DIR]
#
# Default TARGET_DIR: ../webmana-connectors (sibling of this repo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${1:-$ROOT/../webmana-connectors}"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

echo "Source repo : $ROOT (@ $SHA)"
echo "Target dir  : $TARGET"

if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "ERROR: target exists and is not empty: $TARGET" >&2
  exit 1
fi

mkdir -p "$TARGET"

# 1. Export the three SDK packages (tracked files only — no node_modules/dist)
#    to <pkg>/ at the new repo root via `git archive`.
for pkg in contracts connectors create-connector; do
  echo "  + $pkg"
  mkdir -p "$TARGET/$pkg"
  # archive emits packages/<pkg>/...; strip those 2 path components.
  git -C "$ROOT" archive HEAD "packages/$pkg" \
    | tar -x -C "$TARGET/$pkg" --strip-components=2 -f -
done

# 2. Fix tsconfig "extends" depth: packages move from packages/<x>/ (two levels
#    deep) to <x>/ at the repo root (one level), so ../../ becomes ../.
for pkg in contracts connectors create-connector; do
  tsc_file="$TARGET/$pkg/tsconfig.json"
  [ -f "$tsc_file" ] && sed -i 's#\.\./\.\./tsconfig.base.json#../tsconfig.base.json#' "$tsc_file"
done

# 3. Copy the standalone repo root files (README, LICENSE, NOTICE, configs, CI).
cp -r "$ROOT/tooling/connectors-repo/files/." "$TARGET/"

# 4. Initialize a fresh git history.
cd "$TARGET"
git init -q -b main
git add -A
git commit -q -s -m "chore: initial import of Webmana connector SDK (Apache-2.0)

Extracted from WebmanaProject/webmana @ $SHA:
  packages/contracts        -> contracts/
  packages/connectors       -> connectors/
  packages/create-connector -> create-connector/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

echo
echo "Done. Next:"
echo "  cd $TARGET"
echo "  git remote add origin https://github.com/WebmanaProject/webmana-connectors.git"
echo "  git push -u origin main"
