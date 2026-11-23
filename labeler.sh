#!/usr/bin/env bash
set -euo pipefail

labeller_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
action="${1:-menu}"
if (($#)); then shift; fi
transfer_file=""
reviewer=""
batches=()
no_browser=false
while (($#)); do
  case "$1" in
    --file) transfer_file="${2:?Provide a file path}"; shift 2 ;;
    --labeller) reviewer="${2:?Provide a labeller name}"; shift 2 ;;
    --batch) batches+=("${2:?Provide a recording batch ID}"); shift 2 ;;
    --no-browser) no_browser=true; shift ;;
    *) printf 'Unknown option %s\n' "$1" >&2; exit 1 ;;
  esac
done

compose() {
  local arguments=(compose --project-directory "$labeller_root" -f "$labeller_root/compose.labeler.yaml")
  if [[ -f "$labeller_root/labeler.env" ]]; then
    arguments+=(--env-file "$labeller_root/labeler.env")
  fi
  docker "${arguments[@]}" "$@"
}

check_docker() {
  if ! command -v docker >/dev/null; then
    printf 'Install Docker Desktop or Docker Engine with Compose, then open this launcher again.\n' >&2
    return 1
  fi
  local engine
  if ! engine="$(docker info --format '{{.OSType}}' 2>/dev/null)"; then
    printf 'Docker is unavailable. Start Docker and wait for its engine to be ready.\n' >&2
    return 1
  fi
  if [[ "$engine" != linux ]]; then
    printf 'Use Docker with Linux containers.\n' >&2
    return 1
  fi
  docker compose version >/dev/null
}

setting() {
  local name="$1" fallback="$2" configuration="$labeller_root/labeler.env" line value found=false
  if [[ -n "${!name:-}" ]]; then printf '%s\n' "${!name}"; return; fi
  [[ -f "$configuration" ]] || configuration="$labeller_root/.env"
  if [[ -f "$configuration" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      if [[ "$line" == "$name="* ]]; then
        value="${line#*=}"
        value="${value%\"}"; value="${value#\"}"
        value="${value%\'}"; value="${value#\'}"
        found=true
      fi
    done < "$configuration"
  fi
  if $found; then printf '%s\n' "$value"; else printf '%s\n' "$fallback"; fi
}

load_bundled_image() {
  local archive="$labeller_root/labeler-image.tar" configured_image installed database_mode="${1:-false}"
  [[ -f "$archive" ]] || return 1
  configured_image="$(setting LABELER_IMAGE round-labeler-labeler)"
  installed="$(docker image inspect --format '{{.Id}}' "$configured_image" 2>/dev/null || true)"
  if [[ -f "$labeller_root/release.json" ]]; then
    local expected_hash expected_image expected_id actual_hash database_image database_id installed_database database_present=true
    expected_hash="$(sed -nE 's/.*"imageArchiveSha256":[[:space:]]*"([^"]*)".*/\1/p' "$labeller_root/release.json")"
    expected_image="$(sed -nE 's/.*"image":[[:space:]]*"([^"]*)".*/\1/p' "$labeller_root/release.json")"
    expected_id="$(sed -nE 's/.*"imageId":[[:space:]]*"([^"]*)".*/\1/p' "$labeller_root/release.json")"
    database_image="$(sed -nE 's/.*"postgresImage":[[:space:]]*"([^"]*)".*/\1/p' "$labeller_root/release.json")"
    database_id="$(sed -nE 's/.*"postgresImageId":[[:space:]]*"([^"]*)".*/\1/p' "$labeller_root/release.json")"
    if $database_mode; then
      database_image="${database_image:-postgres:17}"
      installed_database="$(docker image inspect --format '{{.Id}}' "$database_image" 2>/dev/null || true)"
      if [[ -z "$installed_database" || ( -n "$database_id" && "$installed_database" != "$database_id" ) ]]; then database_present=false; fi
    fi
    if [[ -n "$expected_image" && "$expected_image" != "$configured_image" ]]; then
      printf 'labeler.env selects a different image from this release.\n' >&2
      return 2
    fi
    if [[ -n "$installed" && -n "$expected_id" && "$installed" == "$expected_id" ]] && $database_present; then return 0; fi
    if [[ -n "$expected_hash" ]]; then
      printf 'Checking the bundled image before loading it...\n' >&2
      if command -v sha256sum >/dev/null; then actual_hash="$(sha256sum "$archive")"
      else actual_hash="$(shasum -a 256 "$archive")"; fi
      if [[ "${actual_hash%% *}" != "$expected_hash" ]]; then
        printf 'The bundled image checksum is incorrect. Extract a fresh copy of the kit.\n' >&2
        return 2
      fi
    fi
    docker load -i "$archive" >&2 || return 2
    installed="$(docker image inspect --format '{{.Id}}' "$configured_image")" || return 2
    if [[ -n "$expected_id" && "$installed" != "$expected_id" ]]; then
      printf 'The loaded image does not match this release.\n' >&2
      return 2
    fi
    if $database_mode; then
      installed_database="$(docker image inspect --format '{{.Id}}' "$database_image")" || return 2
      if [[ -n "$database_id" && "$installed_database" != "$database_id" ]]; then
        printf 'The bundled database image does not match this release.\n' >&2
        return 2
      fi
    fi
  elif [[ -z "$installed" ]] || $database_mode; then
    docker load -i "$archive" >&2 || return 2
    docker image inspect "$configured_image" >/dev/null || return 2
    if $database_mode; then docker image inspect postgres:17 >/dev/null || return 2; fi
  fi
}

labeller_url() {
  local published port
  published="$(compose port labeler 8765)"
  port="${published##*:}"
  [[ "$port" =~ ^[0-9]+$ ]] || { printf 'Start the labeller first.\n' >&2; return 1; }
  printf 'http://127.0.0.1:%s\n' "$port"
}

transfer() (
  local command="$1" file="$2" name="$3" parent basename resume=false
  [[ -n "$file" ]] || { printf 'Provide --file PATH.\n' >&2; exit 1; }
  parent="$(cd -- "$(dirname -- "$file")" && pwd)"
  basename="$(basename -- "$file")"
  if [[ "$command" == import-notes || "$command" == restore ]]; then
    [[ -f "$parent/$basename" ]] || { printf 'The selected file does not exist.\n' >&2; exit 1; }
  fi
  if [[ "$command" == export-notes && -z "$name" ]]; then
    printf 'Provide --labeller NAME.\n' >&2; exit 1
  fi
  local image_status=0
  load_bundled_image || image_status=$?
  (( image_status <= 1 )) || exit "$image_status"
  if [[ "$command" == backup || "$command" == restore ]]; then
    if [[ -n "$(compose ps --status running --quiet labeler)" ]]; then
      compose stop labeler
      resume=true
    fi
  fi
  trap 'if $resume; then compose up -d --wait --no-build labeler; fi' EXIT
  local arguments=(run --rm --no-deps -v "$parent:/transfer" labeler python -m app.annotation.transfer "$command" "/transfer/$basename")
  if [[ "$command" == export-notes ]]; then arguments+=(--labeller "$name"); fi
  compose "${arguments[@]}"
)

list_clips() {
  local image_status=0
  load_bundled_image || image_status=$?
  (( image_status <= 1 )) || return "$image_status"
  compose run --rm --no-deps -T labeler python -m app.annotation.clip_export list \
    || { printf 'Choose Update first so the labeller image includes Export clips for web.\n' >&2; return 1; }
}

# Writes manifest.json and clips/*.mp4 for the web labeller. The workspace volume is read in a
# one-off container; only the destination folder is bind-mounted.
export_clips() (
  local folder="$1" parent identity
  [[ -n "$folder" ]] || { printf 'Provide --file DESTINATION_FOLDER.\n' >&2; exit 1; }
  (( ${#batches[@]} )) || { printf 'Provide at least one --batch ID (see the list-clips action).\n' >&2; exit 1; }
  mkdir -p -- "$folder"
  parent="$(cd -- "$folder" && pwd)"
  local image_status=0
  load_bundled_image || image_status=$?
  (( image_status <= 1 )) || exit "$image_status"
  local arguments=(run --rm --no-deps -T -v "$parent:/export" labeler python -m app.annotation.clip_export export /export)
  for identity in "${batches[@]}"; do
    [[ "$identity" =~ ^[a-f0-9]{32}$ ]] || { printf 'Unknown recording batch %s\n' "$identity" >&2; exit 1; }
    arguments+=(--batch "$identity")
  done
  compose "${arguments[@]}"
  printf 'Clips exported to %s. In the web admin, open a collection and choose this folder.\n' "$parent"
)

database() {
  local configuration="$labeller_root/labeler.env" password port
  local image_status=0
  load_bundled_image true || image_status=$?
  (( image_status <= 1 )) || return "$image_status"
  if [[ ! -f "$configuration" ]]; then cp "$labeller_root/labeler.env.example" "$configuration"; fi
  if [[ -z "$(setting CSDM_DB_PASSWORD '')" ]]; then
    password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
    # Compose uses the last definition when a key occurs more than once.
    printf '\nCSDM_DB_PASSWORD=%s\n' "$password" >> "$configuration"
    chmod 600 "$configuration"
  fi
  if ! compose --profile recording up -d --wait csdm-db; then
    printf 'If the port is occupied, use the existing database or set a free CSDM_DB_PORT in labeler.env.\n' >&2
    return 1
  fi
  port="$(setting CSDM_DB_PORT 5432)"
  printf 'In CS Demo Manager choose Settings > Database > External.\nHost 127.0.0.1, port %s\n' "$port"
  printf 'User %s, database %s\n' "$(setting CSDM_DB_USER postgres)" "$(setting CSDM_DB_NAME csdm)"
  printf 'Read CSDM_DB_PASSWORD from %s.\n' "$configuration"
}

run_action() {
  local command="$1" file="${2:-}" name="${3:-}"
  check_docker
  case "$command" in
    start)
      local image_status=0
      load_bundled_image || image_status=$?
      if ((image_status==0)); then compose up -d --wait --no-build --pull never labeler
      elif ((image_status==1)); then compose up -d --wait labeler
      else return "$image_status"; fi
      local url
      url="$(labeller_url)"
      printf 'Labeller ready at %s\n' "$url"
      if ! $no_browser; then
        if command -v open >/dev/null; then open "$url"
        elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1; fi
      fi ;;
    update) compose up -d --build --wait labeler ;;
    stop) compose stop labeler ;;
    status) compose --profile recording ps ;;
    database) database ;;
    record) printf 'Use Open labeller.cmd on Windows with Steam, CS2, CS Demo Manager and Python 3.11+ to record clips.\n' ;;
    export-notes|import-notes|backup|restore) transfer "$command" "$file" "$name" ;;
    list-clips) list_clips ;;
    export-clips) export_clips "$file" ;;
    *) printf 'Unknown command %s\n' "$command" >&2; return 1 ;;
  esac
}

if [[ "$action" == menu ]]; then
  while true; do
    printf '\nRound Reviewer clip labeller\n1  Start labeller\n2  Status\n3  Stop\n4  Update\n5  Export my notes\n6  Import notes\n7  Back up workspace\n8  Restore workspace\n9  Set up recording database\nW  Export clips for web\n0  Exit\n'
    read -r -p 'Choose: ' choice
    case "$choice" in
      1) action=start;; 2) action=status;; 3) action=stop;; 4) action=update;;
      5) action=export-notes;; 6) action=import-notes;; 7) action=backup;; 8) action=restore;;
      9) action=database;; w|W) action=export-clips;; 0|'') exit 0;; *) printf 'Choose one of the listed options.\n'; continue;;
    esac
    transfer_file=""; reviewer=""
    if [[ "$action" == export-clips ]]; then
      (check_docker && list_clips) || { printf 'The action failed. Read the message above.\n' >&2; continue; }
      read -r -p 'Batch IDs to export (the values in brackets, separated by spaces): ' -a batches
      read -r -p 'Destination folder: ' transfer_file
    fi
    case "$action" in
      export-notes|import-notes|backup|restore) read -r -p 'File path: ' transfer_file;;
    esac
    if [[ "$action" == export-notes ]]; then read -r -p 'Your labeller name: ' reviewer; fi
    (run_action "$action" "$transfer_file" "$reviewer") || printf 'The action failed. Read the message above.\n' >&2
  done
else
  run_action "$action" "$transfer_file" "$reviewer"
fi
