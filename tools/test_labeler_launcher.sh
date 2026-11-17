#!/usr/bin/env bash
set -euo pipefail
repository="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_directory="$(mktemp -d -t rr-launcher-test.XXXXXXXX)"
trap 'case "$test_directory" in */rr-launcher-test.*) rm -rf -- "$test_directory";; esac' EXIT
calls="$test_directory/calls"
running=true
fail_transfer=false

docker() {
  printf '<%s>' "$@" >> "$calls"
  printf '\n' >> "$calls"
  if [[ "$1" == info ]]; then printf 'linux\n'
  elif [[ "$*" == *'ps --status running --quiet labeler'* ]] && $running; then printf 'synthetic-container\n'
  elif [[ "$*" == *' run --rm '* ]] && $fail_transfer; then return 7
  fi
}

set -- status
# The status command is served entirely by the Docker stub above.
source "$repository/labeler.sh"
labeller_root="$test_directory"
printf 'LABELER_PORT=9876\nCSDM_DB_PASSWORD=\nCSDM_DB_PASSWORD=synthetic\n' > "$test_directory/labeler.env"
[[ "$(setting LABELER_PORT 8765)" == 9876 ]]
[[ "$(setting CSDM_DB_PASSWORD '')" == synthetic ]]
printf '{}\n' > "$test_directory/review notes.json"

: > "$calls"
transfer export-notes "$test_directory/review notes.json" alice
grep -F '<--env-file>' "$calls" >/dev/null
grep -F "<-v><$test_directory:/transfer>" "$calls" >/dev/null
grep -F '<export-notes></transfer/review notes.json><--labeller><alice>' "$calls" >/dev/null

: > "$calls"
fail_transfer=true
if transfer backup "$test_directory/backup.zip" ''; then
  printf 'Expected synthetic backup failure.\n' >&2
  exit 1
fi
grep -F '<stop><labeler>' "$calls" >/dev/null
grep -F '<up><-d><--wait><--no-build><labeler>' "$calls" >/dev/null

: > "$calls"
running=false
fail_transfer=false
transfer restore "$test_directory/review notes.json" ''
if grep -F '<up>' "$calls" >/dev/null; then
  printf 'Restore started a previously stopped server.\n' >&2
  exit 1
fi
printf 'Shell launcher settings, spaced paths and transfer recovery passed.\n'
