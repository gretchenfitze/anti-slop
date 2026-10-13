#!/bin/sh
# Claude Code Stop hook: check what the agent changed before it stops.
# Exit 2 sends the findings back so the agent fixes them; a second block in a row
# lets it stop, so a finding it can't fix doesn't loop forever. Checks run in parallel
# and every failure lands in this one block, because the stand-down skips the next stop.
#
# Wire it in .claude/settings.json:
#   { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/anti-slop/agent-check.sh", "timeout": 180 }] }] } }

cd "$(dirname "$0")/.." || exit 0

if command -v jq >/dev/null 2>&1 && [ "$(jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  exit 0
fi

# ponytail: word-splits on spaces in file names; switch to xargs -0 if the repo has them.
files=$({ git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard; } |
  grep -E '\.([cm]?[jt]sx?|vue|svelte|astro)$' | sort -u)
[ -z "$files" ] && exit 0

bin=./node_modules/.bin
tmp=$(mktemp -d) || exit 0
trap 'rm -rf "$tmp"' EXIT

# check <name> <command...>: runs in the background; a failure's output lands in $tmp/<name>.failed.
check() {
  name=$1
  shift
  { "$@" >"$tmp/$name" 2>&1 || mv "$tmp/$name" "$tmp/$name.failed"; } &
}

# One line per check. Add a whole-project detector only once its backlog is zero
# or it reports new findings only. Delete the lines for tools the project doesn't use.
check oxlint $bin/oxlint --deny-warnings $files
check knip $bin/knip --cache
check jscpd $bin/jscpd --config .jscpd.json --baseline-from-ref HEAD --fail-on-new-clones
check react-doctor npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain --scope changed --base HEAD --include-untracked --blocking error
wait

for f in "$tmp"/*.failed; do
  [ -e "$f" ] || exit 0
  printf '\n## %s\n' "$(basename "$f" .failed)" >&2
  cat "$f" >&2
done
exit 2
