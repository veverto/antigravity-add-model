#!/usr/bin/env bash
# ==============================================================================
# Antigravity IDE Launcher Centralizado (Dispatcher)
# Suporta alternar versões via flag (--2.6 ou --2.5) ou caminho customizado.
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VERSION="2.6.0"
CUSTOM_TARGET=""
FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --2.6|-26)
      VERSION="2.6.0"
      shift
      ;;
    --2.5|-25)
      VERSION="2.5.5"
      shift
      ;;
    -h|--help)
      echo "Antigravity IDE Launcher Centralizado"
      echo ""
      echo "Uso: $0 [--2.6 | --2.5] [OPÇÕES] [ARGUMENTOS_DO_VSCODE...]"
      echo ""
      echo "Versões Disponíveis:"
      echo "  --2.6, -26              Executa a versão 2.6.0 (padrão)"
      echo "  --2.5, -25              Executa a versão 2.5.5 (estável anterior)"
      echo ""
      echo "Opções de Sincronização:"
      echo "  --force-overwrite, -f   Força sobrescrita completa a partir do sistema"
      echo "  --no-vscode             Não mescla configurações/extensões do VS Code"
      echo "  --selective, -s         Sincronização granular seletiva"
      echo "  -h, --help              Exibe esta ajuda"
      echo ""
      echo "Exemplos:"
      echo "  $0                      # Abre a 2.6.0 com perfil, extensões e projetos sincronizados"
      echo "  $0 --2.5                # Abre a versão 2.5.5"
      echo "  $0 .                    # Abre a 2.6.0 na pasta atual"
      echo "  $0 /path/to/project     # Abre a 2.6.0 no projeto especificado"
      exit 0
      ;;
    *)
      if [ -z "$CUSTOM_TARGET" ] && [ -d "$1" ] && [ -f "$1/antigravity" ]; then
        CUSTOM_TARGET="$(cd "$1" && pwd)"
      else
        FORWARD_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

if [ -n "$CUSTOM_TARGET" ]; then
  exec "$DIR/run-ide/common.sh" "$CUSTOM_TARGET" "${FORWARD_ARGS[@]}"
elif [ "$VERSION" = "2.5.5" ]; then
  exec "$DIR/run-ide/run-2.5.5.sh" "${FORWARD_ARGS[@]}"
else
  exec "$DIR/run-ide/run-2.6.0.sh" "${FORWARD_ARGS[@]}"
fi
