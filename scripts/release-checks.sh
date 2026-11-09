#!/bin/bash
# Usage: scripts/release-checks.sh <tag>
#
# What the release workflow (.github/workflows/release.yml) checks before
# it builds: the pushed tag must equal the version in manifest.json and in
# package.json, and SEAMSYNC_DROPBOX_APP_KEY must be set and not empty, as
# a build without the key cannot reach Dropbox (ADR 0005). Prints every
# check that fails and exits 1; exits 0 when all pass.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <tag>" >&2
  exit 2
fi
tag=$1

toplevel=$(git rev-parse --show-toplevel)
cd "$toplevel"

status=0
for file in manifest.json package.json; do
  # node reads the JSON; the path is its argument, not part of the code.
  version=$(node -p 'require(process.argv[1]).version' "./$file")
  if [[ $version != "$tag" ]]; then
    echo "error: tag $tag differs from $file version $version" >&2
    status=1
  fi
done
if [[ -z ${SEAMSYNC_DROPBOX_APP_KEY:-} ]]; then
  echo "error: SEAMSYNC_DROPBOX_APP_KEY is unset or empty" >&2
  status=1
fi
exit "$status"
