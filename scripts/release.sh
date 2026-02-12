#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/release.sh <patch|minor|major|version> [npm-tag]"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

VERSION_ARG="$1"
NPM_TAG="${2:-latest}"

echo "Running quality gate before release..."
npm run ci

echo "Bumping version with npm version ${VERSION_ARG}..."
npm version "${VERSION_ARG}"

echo "Publishing package to npm with tag '${NPM_TAG}'..."
npm publish --provenance --access public --tag "${NPM_TAG}"

echo "Release complete. Push your commit and tag with:"
echo "  git push && git push --tags"
