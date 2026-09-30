#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
MODE="local"
INSTALL_ONLY=false
MODE_WAS_SET=false
PORT="${CHAINER_PORT:-3000}"
PORT_WAS_REQUESTED="${CHAINER_PORT:+yes}"

usage() {
  cat <<'EOF'
Usage:
  ./run.sh [--install | --local | --docker] [--port PORT]
  ./run.sh --help

  --install     Install/check npm dependencies only; do not build or start.
  --local       Run the production app locally (default).
  --docker      Run the app and MongoDB with Docker Compose.
  -p, --port    Preferred host port; if occupied, the next free port is used.

The preferred port can also be set with CHAINER_PORT. The script installs
missing npm dependencies, builds when needed, and generates application
secrets in .env.local if they do not exist.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

check_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "This script supports Linux only."
}

validate_port() {
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "Port must be a number between 1 and 65535."
  PORT="$((10#$PORT))"
  (( PORT >= 1 && PORT <= 65535 )) || die "Port must be between 1 and 65535."
}

ensure_secret() {
  local key="$1"
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)" >> "$ENV_FILE"
    printf 'Generated %s in .env.local\n' "$key"
  fi
}

prepare_environment() {
  command -v openssl >/dev/null 2>&1 || die "OpenSSL is required to generate application secrets."
  umask 077
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ensure_secret AUTH_SECRET
  ensure_secret ENCRYPTION_KEY
}

port_is_available() {
  local port="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import socket, sys
port = int(sys.argv[1])
for family, address in ((socket.AF_INET, ("0.0.0.0", port)), (socket.AF_INET6, ("::", port))):
    try:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            if family == socket.AF_INET6:
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            sock.bind(address)
    except OSError:
        sys.exit(1)
' "$port" >/dev/null 2>&1
    return
  fi

  if command -v node >/dev/null 2>&1; then
    node -e '
const net = require("node:net");
const server = net.createServer();
server.once("error", () => process.exit(1));
server.listen(Number(process.argv[1]), "0.0.0.0", () => {
  server.close(() => process.exit(0));
});
' "$port" >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ! ss -H -ltn "sport = :$port" | grep -q .
    return
  fi

  die "Cannot check port availability. Install Python 3, Node.js, or iproute2 (ss)."
}

select_available_port() {
  local candidate="$PORT"
  local attempts=0
  while (( attempts < 1000 )); do
    if port_is_available "$candidate"; then
      if [[ "$candidate" != "$PORT" ]]; then
        printf 'Port %s is unavailable; using port %s instead.\n' "$PORT" "$candidate"
      fi
      PORT="$candidate"
      export CHAINER_PORT="$PORT"
      return
    fi
    (( candidate < 65535 )) || break
    ((candidate += 1))
    ((attempts += 1))
  done
  die "No free port found at or after $PORT."
}

check_node() {
  command -v node >/dev/null 2>&1 || die "Node.js 22 or newer is required. Install Node.js and run this script again."
  command -v npm >/dev/null 2>&1 || die "npm is required. Install Node.js with npm and run this script again."

  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  (( node_major >= 22 )) || die "Node.js 22 or newer is required; found $(node --version)."
}

install_dependencies() {
  local lockfile="$ROOT_DIR/node_modules/.package-lock.json"
  if [[ ! -d "$ROOT_DIR/node_modules" || ! -f "$lockfile" ||
    "$ROOT_DIR/package.json" -nt "$lockfile" ||
    "$ROOT_DIR/package-lock.json" -nt "$lockfile" ]]; then
    printf 'Installing project dependencies...\n'
    (cd "$ROOT_DIR" && npm ci)
  fi
}

build_if_needed() {
  local build_id="$ROOT_DIR/.next/BUILD_ID"
  local rebuild=false

  if [[ ! -f "$build_id" ]]; then
    rebuild=true
  elif find "$ROOT_DIR/src" "$ROOT_DIR/public" -type f -newer "$build_id" -print -quit | grep -q .; then
    rebuild=true
  else
    local file
    for file in package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs; do
      if [[ -f "$ROOT_DIR/$file" && "$ROOT_DIR/$file" -nt "$build_id" ]]; then
        rebuild=true
        break
      fi
    done
  fi

  if [[ "$rebuild" == true ]]; then
    printf 'Building the production app...\n'
    (cd "$ROOT_DIR" && npm run build)
  fi
}

run_local() {
  check_node
  prepare_environment
  select_available_port
  install_dependencies
  build_if_needed

  printf '\nStarting Chainer at http://localhost:%s\nPress Ctrl+C to stop.\n\n' "$PORT"
  cd "$ROOT_DIR"
  exec npm run start -- --hostname 127.0.0.1 --port "$PORT"
}

install_only() {
  check_node
  cd "$ROOT_DIR"
  install_dependencies
  printf '\nProject dependencies are ready.\n'
  printf 'Run locally:  ./run.sh --local\n'
  printf 'Run Docker:   ./run.sh --docker\n'
}

existing_docker_port() {
  local container_id published
  container_id="$(docker compose --env-file "$ENV_FILE" ps -q chainer)"
  [[ -n "$container_id" ]] || return 1
  published="$(docker port "$container_id" 3000/tcp 2>/dev/null | head -n 1 || true)"
  [[ "$published" =~ :([0-9]+)$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

run_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required. Install Docker Engine and Docker Compose plugin first."
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required (docker compose)."
  docker info >/dev/null 2>&1 || die "Docker daemon is not running or this user cannot access it."

  prepare_environment
  cd "$ROOT_DIR"

  local reuse_existing_port=false
  if [[ -z "$PORT_WAS_REQUESTED" ]]; then
    local running_port
    if running_port="$(existing_docker_port)"; then
      PORT="$running_port"
      reuse_existing_port=true
    fi
  fi

  if [[ "$reuse_existing_port" == true ]]; then
    export CHAINER_PORT="$PORT"
  else
    select_available_port
  fi
  docker compose --env-file "$ENV_FILE" up -d --build

  printf '\nChainer and MongoDB are running at http://localhost:%s\n' "$PORT"
  printf 'View logs:      docker compose --env-file .env.local logs -f chainer\n'
  printf 'Stop services:  docker compose --env-file .env.local down\n'
  printf 'Secrets are stored in .env.local; keep that file private and backed up securely.\n'
}

parse_args() {
  while (($#)); do
    case "$1" in
      --install)
        INSTALL_ONLY=true
        ;;
      --local)
        MODE="local"
        MODE_WAS_SET=true
        ;;
      --docker)
        MODE="docker"
        MODE_WAS_SET=true
        ;;
      -p|--port)
        (($# >= 2)) || die "$1 requires a port number."
        PORT="$2"
        PORT_WAS_REQUESTED=yes
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "Unknown option: $1"
        ;;
    esac
    shift
  done
  validate_port
}

main() {
  check_linux
  parse_args "$@"
  if [[ "$INSTALL_ONLY" == true ]]; then
    [[ "$MODE_WAS_SET" == false ]] || die "--install cannot be combined with --local or --docker."
    [[ -z "$PORT_WAS_REQUESTED" ]] || die "--install does not use a port."
    install_only
    return
  fi
  case "$MODE" in
    local) run_local ;;
    docker) run_docker ;;
  esac
}

main "$@"
