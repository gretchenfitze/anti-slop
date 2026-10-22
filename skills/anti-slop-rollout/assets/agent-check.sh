#!/bin/sh
# Agent hook: check what the agent changed before it stops. Written for Claude Code's Stop hook;
# wire the same script into another agent's after-turn hook, adapting the exit code and input to its docs.
# Exit 2 sends the findings back so the agent fixes them; a second block in a row
# lets it stop, so a finding it can't fix doesn't loop forever. Checks run in parallel
# and every failure lands in this one block, because the stand-down skips the next stop.
#
# Wire it in .claude/settings.json:
#   { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/agent-check.sh", "timeout": 180 }] }] } }

cd "$(dirname "$0")/.." || exit 0

if command -v jq >/dev/null 2>&1 && [ "$(jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  exit 0
fi

# File-scoped checks lint the changed source files.
# ponytail: word-splits on spaces in file names; switch to xargs -0 if the repo has them.
files=$({ git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard; } |
  grep -E '\.([cm]?[jt]sx?|vue|svelte|astro)$' | sort -u)
# Whole-project checks run on any change outside the content folders: tsc and tests read
# imported JSON, package.json and tsconfig; knip's plugins read configs and workflows.
# Set the pattern to the folders no check reads.
project=$({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } | grep -vE '^(docs|public)/')
[ -z "$files$project" ] && exit 0

bin=./node_modules/.bin
tmp=$(mktemp -d) || exit 0
trap 'rm -rf "$tmp"' EXIT

# check <name> <command...>: runs in the background; a failure's output lands in $tmp/<name>.failed.
check() {
  name=$1
  shift
  { "$@" >"$tmp/$name" 2>&1 || mv "$tmp/$name" "$tmp/$name.failed"; } &
}

# One line per check. Delete the lines for tools the project doesn't use.
# Keep the line for the project's linter; each treats warnings as errors on changed files.
[ -n "$files" ] && check oxlint $bin/oxlint --deny-warnings $files
# [ -n "$files" ] && check eslint $bin/eslint --max-warnings=0 $files
# [ -n "$files" ] && check biome $bin/biome lint --error-on-warnings $files
[ -n "$files" ] && check react-doctor npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain --scope changed --base HEAD --include-untracked --blocking error
# Whole-project: they see what a change breaks in files it didn't touch, like the unchanged
# callers of a function that gained a required parameter. Add one only while it reports new
# findings only (a clean baseline, a backlog at zero) and the hook stays within its budget.
[ -n "$project" ] && check tsc $bin/tsc --noEmit
[ -n "$project" ] && check test npm test --silent # the unit suite, not e2e, through the project's package manager
[ -n "$project" ] && check knip $bin/knip --cache
# At zero clones with "threshold": 0 in the config; with a backlog, add --baseline-from-ref HEAD --fail-on-new-clones.
[ -n "$project" ] && check jscpd $bin/jscpd
wait

for f in "$tmp"/*.failed; do
  [ -e "$f" ] || exit 0
  printf '\n## %s\n' "$(basename "$f" .failed)" >&2
  cat "$f" >&2
done
exit 2
