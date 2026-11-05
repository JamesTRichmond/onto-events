#!/usr/bin/env bash
# One command for a production iOS build: `npm run build:ios`.
#
# Why this exists (build 8, 2026-09-25): eas-cli evaluates app.config.js once
# with only the build profile's `env` (ONTO_RELEASE_BUILD=1) to find the
# project id, BEFORE it fetches the EAS "production" environment. The release
# guard in scripts/release/environment.cjs is fail-closed, so that first pass
# sees no Supabase values and stops the build, even though EAS holds them.
# The guard stays as it is; this script hands it the real values instead.
#
# Values are pulled into a private temp file, exported for this one command,
# and the file is deleted on any exit. Nothing is printed, and .env.local in
# the repo is never written.
set -euo pipefail

cd "$(dirname "$0")/.."

env_file="$(mktemp "${TMPDIR:-/tmp}/onto-release-env.XXXXXX")"
chmod 600 "$env_file"
trap 'rm -f "$env_file"' EXIT

npx --yes eas-cli env:pull --environment production --path "$env_file" --non-interactive >/dev/null

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
rm -f "$env_file"

# EXPO_NO_KEYCHAIN avoids the macOS keychain error -20209 seen on release day.
EXPO_NO_KEYCHAIN=1 npx --yes eas-cli build --platform ios --profile production "$@"
