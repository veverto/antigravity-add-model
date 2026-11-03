#!/usr/bin/env bash
# ==============================================================================
# Runner comum do Antigravity IDE
# Argumentos: <TARGET_IDE_DIR> [OPÇÕES...] [ARGUMENTOS_DO_VSCODE...]
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 1. Validação do Target da IDE
TARGET_IDE="$1"
if [ -z "$TARGET_IDE" ] || [ ! -d "$TARGET_IDE" ] || [ ! -f "$TARGET_IDE/antigravity" ]; then
  echo "Erro: Binário 'antigravity' não encontrado no diretório: $TARGET_IDE"
  echo "Uso: $0 <CAMINHO_DO_TARGET_IDE> [OPÇÕES...]"
  exit 1
fi
shift

# 2. Definição de Caminhos
SYSTEM_CONFIG="$HOME/.config/Antigravity IDE"
SYSTEM_GEMINI="$HOME/.gemini/antigravity-ide"

PROFILE_DIR="$TARGET_IDE/.profile"
USER_DATA_DIR="$PROFILE_DIR/user-data"
USER_DIR="$USER_DATA_DIR/User"
GLOBAL_STORAGE="$USER_DIR/globalStorage"
PROFILE_EXTENSIONS="$PROFILE_DIR/extensions"

mkdir -p "$USER_DIR"
mkdir -p "$GLOBAL_STORAGE"
mkdir -p "$PROFILE_EXTENSIONS"

# 3. Processamento de flags do launcher
FORCE_OVERWRITE=false
SYNC_VSCODE=true
SELECTIVE=false
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-overwrite|--force-sync|-f)
      FORCE_OVERWRITE=true
      shift
      ;;
    --no-vscode)
      SYNC_VSCODE=false
      shift
      ;;
    --selective|-s)
      SELECTIVE=true
      shift
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

# 4. Sincronização Inteligente de Perfil, Conversas, Projetos e Extensões
if [ -f "$ROOT_DIR/sync-conversations.py" ]; then
  if [ "$FORCE_OVERWRITE" = true ]; then
    echo "[run-ide] ⚠️  Flag --force-overwrite detectada: Sobrescrevendo dados dos testes..."
    if [ -f "$GLOBAL_STORAGE/state.vscdb" ]; then
      TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
      cp "$GLOBAL_STORAGE/state.vscdb" "$GLOBAL_STORAGE/state.vscdb.backup_${TIMESTAMP}"
      echo "[run-ide]   ✓ Backup de segurança salvo: $GLOBAL_STORAGE/state.vscdb.backup_${TIMESTAMP}"
    fi
    cp -f "$SYSTEM_CONFIG/User/globalStorage/state.vscdb" "$GLOBAL_STORAGE/state.vscdb" 2>/dev/null || true
    cp -f "$SYSTEM_CONFIG/User/globalStorage/storage.json" "$GLOBAL_STORAGE/storage.json" 2>/dev/null || true
  fi

  SYNC_ARGS=("--target-ide" "$TARGET_IDE" "--to-test" "--sync")
  if [ "$SYNC_VSCODE" = false ]; then
    SYNC_ARGS+=("--no-vscode")
  fi
  python3 "$ROOT_DIR/sync-conversations.py" "${SYNC_ARGS[@]}"
fi

# Copia workspaces caso não existam
if [ -d "$SYSTEM_CONFIG/User/workspaceStorage" ]; then
  mkdir -p "$USER_DIR/workspaceStorage"
  cp -ru "$SYSTEM_CONFIG/User/workspaceStorage/"* "$USER_DIR/workspaceStorage/" 2>/dev/null || true
fi

TARGET_NAME="$(basename "$TARGET_IDE")"

echo "===================================================================="
echo "Iniciando Antigravity IDE [$TARGET_NAME]"
echo "--------------------------------------------------------------------"
echo "  • Diretório da IDE: $TARGET_IDE"
echo "  • Conversas & Brain: $SYSTEM_GEMINI (Nativo em tempo real)"
echo "  • Extensões:         $PROFILE_EXTENSIONS (Antigravity + VS Code)"
echo "  • Perfil & UI:       $USER_DATA_DIR (Sincronizado sem lock)"
echo "===================================================================="

# 5. Execução limpa desarmando ELECTRON_RUN_AS_NODE
unset ELECTRON_RUN_AS_NODE
exec "$TARGET_IDE/antigravity" \
  --no-sandbox \
  --user-data-dir "$USER_DATA_DIR" \
  --extensions-dir "$PROFILE_EXTENSIONS" \
  "${EXTRA_ARGS[@]}"
