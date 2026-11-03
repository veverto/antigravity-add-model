#!/usr/bin/env bash
# ==============================================================================
# Runner do Antigravity IDE v2.5.5
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$DIR/run-ide/common.sh" "$DIR/antigravity-ide" "$@"
