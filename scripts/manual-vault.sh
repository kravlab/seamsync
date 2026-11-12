#!/bin/bash
# Usage: scripts/manual-vault.sh [--force] [--] [<vault-dir>]
#
# Creates an Obsidian vault for manually testing the plugin, by default in
# .e2e/manual-vault under the repository's toplevel, and prints its path on
# stdout. A relative <vault-dir> is taken relative to the current directory;
# after `--`, an argument is a <vault-dir> even if it starts with a dash.
#
# The vault's plugin folder (.obsidian/plugins/<plugin id>) is a relative
# symlink to dist/, so the rebuilds of `pnpm dev` reach Obsidian without
# copying. Obsidian writes the plugin's data.json through the link into
# dist/ (git-ignored; a rebuild does not remove it). The vault also gets a
# community-plugins.json that enables the plugin and a Welcome.md, each only
# when absent, so running the script again keeps the notes and the edited
# settings.
#
# <vault-dir> may be missing, an empty directory, or an existing vault (it
# has a .obsidian/ folder). Any other path is refused with exit 1, writing
# nothing: a file, or a non-empty directory that is not a vault. So is a
# vault whose plugin path is not the link to dist/, and a manifest.json
# without a valid plugin id.
#   --force  deletes the vault first (printing `removing <vault>` on stderr)
#            and creates it anew. It refuses, besides the above, a directory
#            that is not a vault and the repository itself or any directory
#            that contains it.
#
# Warns on stderr, still exiting 0, when dist/manifest.json is missing, as
# Obsidian then finds no plugin.
set -euo pipefail

usage() {
  echo "usage: $0 [--force] [--] [<vault-dir>]" >&2
  exit 2
}

force=false
vault_arg=""
have_vault=false
options_done=false
for arg in "$@"; do
  if [[ $options_done == false ]]; then
    case $arg in
    --)
      options_done=true
      continue
      ;;
    --force)
      force=true
      continue
      ;;
    -*) usage ;;
    esac
  fi
  [[ $have_vault == false ]] || usage
  vault_arg=$arg
  have_vault=true
done

toplevel=$(git rev-parse --show-toplevel)
# Resolved before the cd below, so a relative path means the caller's cwd.
# node does the path work; paths are its arguments, not part of the code.
if [[ $have_vault == true ]]; then
  vault=$(node -p 'require("node:path").resolve(process.argv[1])' -- "$vault_arg")
else
  vault="$toplevel/.e2e/manual-vault"
fi
cd "$toplevel"

if ! id=$(node -p '
const id = require(process.argv[1]).id;
if (typeof id !== "string" || !/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..") process.exit(1);
id' "./manifest.json"); then
  echo "error: manifest.json has no valid id" >&2
  exit 1
fi
plugins_dir="$vault/.obsidian/plugins"
link="$plugins_dir/$id"

# Prints the text of the link to dist/, relative to the physical plugin
# folder, so it holds when the vault path or .e2e/ goes through a symlink.
# dist/ itself is not resolved. The plugin folder must exist.
link_text() {
  node -p '
const fs = require("node:fs");
const path = require("node:path");
path.relative(fs.realpathSync(process.argv[1]), fs.realpathSync(process.argv[2]) + "/dist")' \
    -- "$plugins_dir" "$toplevel"
}

if [[ -e $vault || -L $vault ]]; then
  if [[ ! -d $vault ]]; then
    echo "error: $vault exists and is not a directory" >&2
    exit 1
  fi
  if [[ $force == true ]]; then
    # Checked before anything else, even when the vault looks like one.
    if node -e '
const fs = require("node:fs");
const path = require("node:path");
const relative = path.relative(fs.realpathSync(process.argv[1]), fs.realpathSync(process.argv[2]));
process.exit(relative !== ".." && !relative.startsWith(".." + path.sep) ? 0 : 1)' -- "$vault" "$toplevel"; then
      echo "error: $vault is the repository or contains it" >&2
      exit 1
    fi
    if [[ ! -d $vault/.obsidian ]]; then
      echo "error: $vault exists and is not a vault (no .obsidian/)" >&2
      exit 1
    fi
  elif [[ ! -d $vault/.obsidian && -n $(find "$vault" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
    echo "error: $vault is not empty and is not a vault (no .obsidian/)" >&2
    exit 1
  fi
fi

if [[ $force == true && -d $vault ]]; then
  echo "removing $vault" >&2
  rm -rf -- "$vault"
fi

if [[ -e $link || -L $link ]]; then
  if [[ ! -L $link || $(readlink "$link") != "$(link_text)" ]]; then
    echo "error: $link exists and is not a link to dist/" >&2
    exit 1
  fi
else
  mkdir -p "$plugins_dir"
  ln -s "$(link_text)" "$link"
fi

if [[ ! -e $vault/.obsidian/community-plugins.json ]]; then
  node -p 'JSON.stringify([process.argv[1]])' -- "$id" >"$vault/.obsidian/community-plugins.json"
fi
if [[ ! -e $vault/Welcome.md ]]; then
  cat >"$vault/Welcome.md" <<'EOF'
# Test vault

This vault is for manual testing of the plugin. The plugin folder links to
the repository's dist/, so rebuilds from `pnpm dev` reach it. Reload the
plugin in Obsidian to pick them up.
EOF
fi

if [[ ! -e $toplevel/dist/manifest.json ]]; then
  echo "warning: dist/manifest.json is missing; run pnpm build or pnpm dev so Obsidian finds the plugin" >&2
fi
echo "$vault"
