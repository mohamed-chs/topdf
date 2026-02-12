#!/usr/bin/env bash
set -euo pipefail

echo "Running local release dry-run checks..."
npm run ci

echo "Packing tarball (dry-run)..."
npm pack --dry-run

echo "Simulating npm publish (dry-run)..."
npm publish --provenance --access public --dry-run

echo "Dry-run completed successfully."
