#!/usr/bin/env bash
# ==============================================================================
# Runner do Antigravity IDE v2.6.0
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$DIR/run-ide/common.sh" "$DIR/antigravity-ide-2.6.0" "$@"
