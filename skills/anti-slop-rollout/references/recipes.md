# Recipes

Read **Adapting to the stack**, **Conventions**, and **Running often**, then only the section for the step you're doing. Package versions below are the ones verified when this was written. Add the current versions with the project's package manager, and check a tool's `--help` when a flag here doesn't match.

Contents: [Adapting to the stack](#adapting-to-the-stack) · [Conventions](#conventions) · [Running often](#running-often) · [1 Contract](#1-api-contract) · [2 Strict TS](#2-strict-typescript) · [3 Linter rules](#3-linter-rules) · [4 Boundaries](#4-boundaries) · [5 Scar rules](#5-scar-rules) · [6 Agent rules and hooks](#6-agent-rules-and-hooks) · [7 Mutation testing](#7-mutation-testing) · [8 Dead code](#8-dead-code) · [9 Duplicates](#9-duplicates) · [10 CI gate](#10-ci-gate) · [react-doctor](#react-doctor) · [Trim the rules file](#trim-the-rules-file)

## Adapting to the stack

**Linter.** Every rule set in these recipes is an ESLint plugin.

- **ESLint (flat config):** add the plugin as a devDependency and spread its config into `eslint.config.*`.
- **oxlint:** native rules go in `.oxlintrc.json` under their plugin (`typescript/`, `import/`, `react/`, `jsx-a11y/`, `vitest/`, `jest/`). ESLint plugins load through `"jsPlugins": ["eslint-plugin-sonarjs", ...]`, resolved from the config's directory; their rules are named after the plugin without `eslint-plugin-` (`sonarjs/cognitive-complexity`). oxlint can't load a plugin's preset, so list the rules. The audit probe already built that list: `probe.json` → `lint.config` points at a working config with absolute paths. Copy its rules and replace the paths with package names.
- **Biome** can't load ESLint plugins. Add oxlint next to it for the plugin rules only (`"categories": {}` so it doesn't duplicate Biome's rules). It runs in seconds. Don't migrate the project off Biome.

**Template files.** oxlint and ESLint processors see only the script part of `.astro`, `.vue`, and `.svelte` files, so anything used only in the template looks unused. Turn off `sonarjs/unused-import`, `sonarjs/no-unused-vars`, and `sonarjs/no-dead-store` for those globs in an `overrides` entry, with a comment saying why.

**Changed files only.** New rules land as warnings, and the hook that checks changed files treats warnings as errors (`oxlint --deny-warnings <files>`, `eslint --max-warnings=0 <files>`). New and touched code must pass, while the backlog doesn't block anyone. CI runs the full lint without failing on warnings until the rule is promoted.

**Git hooks.** Use what the project has:

- **lefthook:** add a job to the `pre-commit` group, and to the group the agent hook runs if there is one. Its globs match paths without a separator, so `**/*.json` misses root files like `package.json` and `tsconfig.json`: write `*.{js,ts,json}`.
- **husky** with lint-staged or nano-staged: add a glob entry.
- **simple-git-hooks:** edit its command.
- **Nothing:** add `nano-staged` with `simple-git-hooks`, the lightest pair.

**CI.** The recipes show GitHub Actions; the project's existing CI config says which provider it has. Keep the shape in that provider's syntax: a named step per check and a job per file set (section 10), full history and the PR's target branch fetched for diff-based jobs, non-blocking for the slow ones, a PR comment posted through the forge CLI. The bundled scripts take the base ref as an argument and print markdown, so they run anywhere. GitLab: `GIT_DEPTH: 0` for full history, `git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"` for the base ref, `glab mr note` for the comment.

**Package scripts.** Name them after what they do (`deadcode`, `dup`, `mutation`), match the existing naming style (`lint:scripts` vs `lint-scripts`), and call the tool directly, not through `npx`. Don't reuse a package manager built-in: `pnpm doctor`, `pnpm audit`, `pnpm outdated`, `npm doctor` and friends run the built-in instead of your script, exit 0, and look like success.

**Where things go.** Tool configs live at the root, where the tools look for them: `knip.jsonc`, `.jscpd.json`, `stryker.config.json`. Scripts and the project's own lint rules live in `anti-slop/`, next to the plan: `anti-slop/find-dead-code.mjs`, `anti-slop/lint-rules/`. The bundled scripts resolve the repo root as their parent directory, so keep them directly in `anti-slop/`. Report output goes to `reports/` (gitignored).

## Conventions

Add a section to the project's agent rules file (AGENTS.md, or CLAUDE.md if that's what the project uses) the first time a rollout step runs. Match the file's voice and keep it short: the file competes for the model's attention.

```markdown
## Anti-slop checks

Rolled out step by step from `anti-slop/todo.md`; the reasoning is in `anti-slop/plan.md`.

- Fix what a check finds; don't silence it. No new `!`, `as any`, `@ts-expect-error`, or disable comments to get a check green.
- Lint warnings fail the hooks on changed files and only print in CI, so a new rule starts as a warning that touched code must pass. The Stop hook also runs whole-project checks (typecheck, tests), so it can report a file the change didn't touch.
- Every ignore entry (knip `ignore`, jscpd `ignore`, lint `overrides`, a disable comment) carries a comment saying why. Review the lists when they grow: each entry is code a detector was told not to look at.
- A lint message says what failed, why the rule exists, and what to do instead.
- A project lint rule (`anti-slop/lint-rules/`) names the incident behind it: a commit, PR, or bug. No incident, no rule.
- Scores (react-doctor, mutation) are diagnostics, not targets. Don't change code to move a number.

Commands:

- `<cmd>`: <what it checks, when to run it>
```

Drop the lines about tools the plan doesn't use. If the file already has a commands list, put the commands there and leave only the conventions in this section. Either way, each later step adds its commands in the same place.

## Running often

Each check runs at the cheapest moment that still catches what it's for. The plan's **When checks run** table decides this for the project, using timings measured there. The table below is the default the audit starts from, with timings from a 400-file Astro + React repo.

**When wiring a check,** put it where the plan's table says, then time it with the installed tool. If it's now over that moment's budget, move it to the next moment, and update the table and the Log.

| When | What | How |
|---|---|---|
| Every agent turn and commit, on changed files | lint rules (presets, boundaries, project rules) | the agent Stop hook and pre-commit (section 6) |
| Every agent turn, on changed files | react-doctor `--scope changed --base HEAD` (about 13 s) | the Stop hook only: it's over the pre-commit budget, and its startup alone takes most of it |
| Every agent turn, whole project but fast | typecheck on a clean baseline (about 5 s), the unit suite, knip at zero (about 3 s with `--cache`), jscpd (under a second as a plain run at zero clones, about 11 s in baseline mode) | the Stop hook, once the check reports new findings only and while the whole hook stays under budget (section 6); a sub-second one can join pre-commit too |
| Every PR | typecheck, unit tests, knip, jscpd new clones vs the base branch, react-doctor (a full scan, or on the diff when that doesn't fit; blocks on errors once they're zero), mutation testing on changed files (non-blocking) | CI, a named step per check (section 10) |
| Weekly | full jscpd report (`dup:top`), full react-doctor (kept after its gate, see react-doctor), full mutation run | the scheduled report below, when the plan has a Scheduled row |
| Re-audit | ignore lists, rules that caught nothing, new numbers | rerun `anti-slop-audit` when the plan says |

**Scheduled report.** One workflow runs the commands in the plan's Scheduled row and writes a summary into one open issue, assigned to whoever that row names. The backlog stays visible without blocking anyone. GitHub Actions:

```yaml
# .github/workflows/anti-slop-report.yml
name: Anti-slop report
on:
  schedule:
    - cron: '0 6 * * 1' # Mondays; match the plan's frequency
  workflow_dispatch:
permissions:
  contents: read
  issues: write
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      # the same pnpm/node setup and install steps the other jobs use
      - run: |
          {
            echo '## Duplicates'; pnpm -s dup:top || true
            echo '## react-doctor'; pnpm -s react-doctor | tail -n 40 || true
            echo '## Mutation'; pnpm -s mutation | tail -n 40 || true
            echo "Full reports: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
          } > report.md 2>&1
      - uses: actions/upload-artifact@<pinned>
        with:
          name: anti-slop-reports
          path: reports/
      - env:
          GH_TOKEN: ${{ github.token }}
        run: |
          n=$(gh issue list --state open --search 'in:title "Anti-slop report"' --json number --jq '.[0].number // empty')
          if [ -n "$n" ]; then gh issue edit "$n" --body-file report.md
          else gh issue create --title 'Anti-slop report' --body-file report.md --assignee <login>; fi
```

- **One line per command** in the plan's Scheduled row. Keep each to a summary: the issue is for reading, and the artifact keeps the full reports.
- **Each run replaces the issue body** rather than adding a comment, so the issue is always one current list. GitHub keeps the edit history.
- **Scheduled workflows run from the default branch,** and GitHub disables them in a public repo after 60 days without activity. Run it once with `workflow_dispatch` to verify it.
- **GitLab:** add a pipeline schedule (Build › Pipeline schedules) and a job with `rules: [{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]`. **Other CI:** use its scheduled-pipeline feature with the same commands. Without a forge CLI, keep the artifact and skip the issue.

## 1. API contract

**Generate** from the spec with [Hey API](https://heyapi.dev) (`@hey-api/openapi-ts`):

- Configure the input spec, an output directory (`src/api/generated` unless the project has a convention), and plugins for the client the project uses (`@hey-api/client-fetch` or `@hey-api/client-axios`) plus `zod`. Add `@tanstack/react-query` if the project uses it.
- Check the current Hey API docs for the config shape; it has changed between majors.
- Add an `api:generate` script.

**Keep it out of review:** exclude the generated directory from lint, format, knip, jscpd, and mutation globs, and mark it in `.gitattributes` with `linguist-generated=true` so GitHub collapses its diffs.

**Keep it fresh:** add a CI step that runs `api:generate` and then `git diff --exit-code`.

**Validate at runtime:** parse responses with the generated Zod schemas at the boundary (the API client or query function). Types exist at compile time, responses arrive at runtime, and the model trusts the type.

**Migrate call sites** in follow-up steps, one feature per PR. Delete the hand-written types as each feature moves.

## 2. Strict TypeScript

One flag per PR. Turn on `strict` before the others.

**`noUncheckedIndexedAccess`** fixes, best first:

- Restructure: `for…of` instead of index loops, destructuring with a default, `.find()` plus a guard.
- Guard and return early: `const first = items[0]; if (!first) return …`.
- For a `Record` lookup that may miss, use `Map`, an `in` check, or `?? fallback` where a fallback is correct.

**Never `!`.** Section 3's `no-non-null-assertion` should already be an error, so the shortcut fails lint.

**`exactOptionalPropertyTypes`:** write `prop?: T | undefined` where `undefined` is passed on purpose, and use conditional spreads (`...(x !== undefined && { x })`) where it isn't.

**Framework checkers:** if the project also runs `astro check`, `vue-tsc`, or `svelte-check`, those must pass too. They see files tsc doesn't.

**Too many errors for one PR** (the plan says when): split by top-level directory. Each PR fixes one directory with the flag set only locally (`tsc --noEmit --noUncheckedIndexedAccess | grep '^src/<dir>/'`). The last PR flips the flag in `tsconfig.json`.

## 3. Linter rules

| Rule set | ESLint | oxlint |
|---|---|---|
| sonarjs | `eslint-plugin-sonarjs`, `sonarjs.configs.recommended` | `jsPlugins: ["eslint-plugin-sonarjs"]` plus the rule list |
| unnecessary effects | `eslint-plugin-react-you-might-not-need-an-effect`, `.configs.recommended` | `jsPlugins`, rules `react-you-might-not-need-an-effect/*` |
| test assertions | `@vitest/eslint-plugin` (`expect-expect`, `no-focused-tests`) or `eslint-plugin-jest` | native `vitest/expect-expect`, `vitest/no-focused-tests` (or `jest/…`) |
| Playwright | `eslint-plugin-playwright`, `configs['flat/recommended']` on the e2e glob | `jsPlugins`, rules in an `overrides` entry for the e2e glob |
| accessibility | `eslint-plugin-jsx-a11y` recommended | native `jsx-a11y/*` |
| TypeScript shortcuts | `typescript-eslint` | native `typescript/no-explicit-any`, `no-non-null-assertion`, `consistent-type-definitions`, `explicit-module-boundary-types` |

oxlint shape (warnings first; promote later):

```jsonc
{
  "plugins": ["typescript", "import", "react", "jsx-a11y", "vitest"],
  "jsPlugins": ["eslint-plugin-sonarjs", "eslint-plugin-react-you-might-not-need-an-effect", "eslint-plugin-playwright"],
  "rules": {
    "typescript/no-non-null-assertion": "error",
    "typescript/no-explicit-any": "warn",
    "typescript/consistent-type-definitions": ["error", "type"],
    "vitest/expect-expect": "error",
    "vitest/no-focused-tests": "error",
    "sonarjs/cognitive-complexity": "warn"
    // …the rest of sonarjs recommended and the effect rules, as warnings
  },
  "overrides": [
    {
      // oxlint sees only the frontmatter/script block; template usages look unused
      "files": ["**/*.astro", "**/*.vue", "**/*.svelte"],
      "rules": { "sonarjs/unused-import": "off", "sonarjs/no-unused-vars": "off", "sonarjs/no-dead-store": "off" }
    },
    {
      "files": ["e2e/**"],
      "rules": {
        "playwright/missing-playwright-await": "error",
        "playwright/no-focused-test": "error",
        "playwright/no-conditional-in-test": "warn",
        "playwright/no-wait-for-timeout": "warn"
      }
    }
  ]
}
```

**Promoting** a rule means making it an error once its count is zero, or once it catches a real bug. Delete a rule that produced only noise for a month. Turn off sonarjs rules that misfire on a whole path category (build scripts: `no-os-command-from-path`, `pseudo-random`) with an override and a reason, not one disable at a time.

**The effect detector on SSR and islands frameworks:** an effect that sets state after mount, to avoid a hydration mismatch, is often legitimate. If the project relies on that pattern, keep `no-initialize-state` as a warning and document the pattern in the rules file, so the agent knows which hits are by design.

## 4. Boundaries

**For one to three rules,** use the linter's native `no-restricted-imports` in an `overrides` entry per directory. It needs no plugin, and the `message` field carries the reason:

```jsonc
{
  "files": ["src/components/**"],
  "rules": {
    "no-restricted-imports": ["error", { "patterns": [{
      "group": ["**/server/**", "node:*"],
      "message": "Components ship to the browser: server-only modules (Node APIs, secrets) break the client bundle. Load the value on the server and pass it down as a prop."
    }] }]
  }
}
```

**For a layer map,** use `eslint-plugin-boundaries` (v7: `boundaries/elements` in settings, the `boundaries/dependencies` rule with `policies`). It goes in `jsPlugins` for oxlint. Every policy carries a `message` that says where the import should go:

```jsonc
"settings": {
  "boundaries/elements": [
    { "type": "services", "pattern": "src/services", "partialMatch": true },
    { "type": "components", "pattern": "src/components", "partialMatch": true }
  ]
},
"rules": {
  "boundaries/dependencies": ["error", {
    "default": "allow",
    "policies": [{
      "from": [{ "element": { "type": ["services"] } }],
      "disallow": [{ "to": { "element": { "type": ["components"] } } }],
      "message": "Business layers stay UI-free: a service must not import components. A type shared with a form belongs next to the service."
    }]
  }]
}
```

`dependency-cruiser` does the same as a separate CLI; use it only if the project already has it.

**Cycles:** turn on `import/no-cycle`, fix the existing ones in the same PR when there are a handful, and make it an error.

**Pick the rules from the plan,** which ties each one to a doc line or incident. Don't impose a generic layer map on a codebase that's organized differently.

## 5. Scar rules

The template is in `assets/lint-rules/`. Copy it to `anti-slop/lint-rules/`, delete the example rule, and write the project's rules. Each rule has three parts:

- **Matcher:** keep it as narrow as the incident.
- **Message:** what failed, why (the incident in one sentence, with numbers if there were any), and what to do instead.
- **`docs.url`:** the PR, issue, or commit.

**Loading:**

- **oxlint:** `"jsPlugins": ["./anti-slop/lint-rules/index.cjs"]`. Rules are `local/<name>`, from the plugin's `meta.name`.
- **ESLint:** `import local from './anti-slop/lint-rules/index.cjs'`, then `{ plugins: { local }, rules: { 'local/<name>': 'error' } }`.

**Testing:**

- **oxlint:** `lint-rules.test.mjs` runs the linter over `fixtures/` and checks each rule fires exactly where it should. Add a violating and a clean fixture per rule. Run it with `node --test anti-slop/lint-rules/lint-rules.test.mjs`, and add that command to the unit-test script.
- **ESLint:** use `RuleTester` from `eslint` with `node:test` (set `RuleTester.describe = describe; RuleTester.it = it`) instead.

**Keep the fixtures out of everything else.** Add `anti-slop/lint-rules/fixtures/**` to the main lint config's ignores, and to knip, jscpd, and tsconfig `exclude` if their globs reach it.

**Prove it on the incident.** Run the rule against the code from before the fix (`git show <fix-sha>^:<file>`). It must fire there.

**CSS scars** (a stylelint rule) follow the same idea with `stylelint.createPlugin`. Put them in `anti-slop/lint-rules/stylelint/` and test them with `stylelint`'s Node API.

## 6. Agent rules and hooks

**Rules file:** add the Conventions section above.

**Stop hook** (Claude Code):

- **If the project already has one,** add the new checks to whatever it runs.
- **If not,** copy `assets/agent-check.sh` to `anti-slop/agent-check.sh`, delete the lines for tools the project doesn't use, swap `oxlint` for `eslint --max-warnings=0` if needed, and wire it in `.claude/settings.json` as its header shows.

The hook exits 2 so Claude Code sends the findings back and the agent fixes them before it finishes. It stands down on the second block in a row so an unfixable finding can't loop. That's why one block must carry every failure: the script runs its checks in parallel and reports them all. A hook that chains checks with `&&` reports only the first failure, and the stand-down then skips the rest until the next prompt.

**Whole-project checks join the hook** once they report new findings only: typecheck on a clean baseline, the unit suite, knip and jscpd at zero. Changed-files lint sees only the files it lints, so when a function gains a required parameter, only the typecheck reports its unchanged callers. Add them while the whole hook stays within the plan's budget, timed with and without a code change.

**Trigger each check on what it reads.** The template lints changed source files, but runs the whole-project checks on any change outside the content folders: tsc and the tests read imported JSON, `package.json`, and `tsconfig.json`, and knip's plugins read the configs and workflows they know, so a turn that edits only one of those can still break the build or orphan a module.

**Pre-commit:** the file-scoped lint for humans, plus any whole-project check that takes under a second (jscpd at zero, section 9), through the project's hook tool (see Adapting to the stack).

**Other agents:** Cursor, Codex, and others have their own hook or rules mechanisms. Wire the same script where the project uses them, and say in the PR which agents are covered.

## 7. Mutation testing

**Packages:** `@stryker-mutator/core` plus the runner (`@stryker-mutator/vitest-runner` or `@stryker-mutator/jest-runner`).

**No dedicated runner** (`node:test`, Bun): use `"testRunner": "command"` with `"commandRunner": { "command": "<the unit-test script>" }` and `coverageAnalysis: "off"`. Each mutant reruns the whole suite, so keep `mutate` to the pure-logic modules the plan names and run it locally or weekly, not on every PR.

**`stryker.config.json`:**

- `testRunner`, `coverageAnalysis: "perTest"`, `incremental: true` with `incrementalFile: ".stryker-incremental.json"` (commit it, so CI reuses results).
- `mutate`: logic directories only (services, lib, utils, stores), not components, tests, or generated code.
- Reporters `html`, `clear-text`, `progress`, plus `json` at `reports/mutation/mutation.json`.
- `thresholds.break: null`: **no failure threshold.**
- `tempDirName: "reports/stryker-tmp"`.
- If Stryker can't sandbox the project (TypeScript 7 dropped the programmatic compiler API), set `inPlace: true`.

**Scripts:**

- `mutation`: `stryker run`.
- `mutation:changed`: `stryker run --mutate "$(node anti-slop/changed-mutants.mjs origin/<default-branch>)"`. Copy `assets/scripts/changed-mutants.mjs`.

**CI:** a non-blocking job on pull requests only, with full history (GitHub Actions: `continue-on-error: true`, `fetch-depth: 0`):

1. Compute the changed files with `changed-mutants.mjs`.
2. Run Stryker on them with `--reporters json`.
3. Build a comment with `anti-slop/mutation-pr-report.mjs` (from `assets/scripts/`).
4. Post or update one PR comment marked `<!-- mutation-report -->`, through the forge CLI (`gh pr comment`, `glab mr note`).

The comment lists surviving mutants on changed lines. A survivor is a missing assertion, not a bug. The usual causes are shape asserted instead of content, an unverified snapshot, or a test that checks the mock.

## 8. Dead code

**knip.** Install `knip`, and write `knip.jsonc` (JSONC so every ignore can carry its reason):

```jsonc
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  // Framework plugins (Next, Astro, Vite, Vitest, Playwright, …) switch on by themselves when the
  // dependency is installed. List only what they miss.
  "entry": ["scripts/*.mjs"],
  // knip's default extensions plus the framework's; setting `project` replaces the default
  "project": [
    "**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,astro}",
    // a folder loaded by glob (content collections, data files)
    "!<folder>/**"
  ],
  "ignore": [
    // generated by `api:generate`, checked by its own CI step
    "src/api/generated/**"
  ],
  "ignoreDependencies": [
    // referenced by name in vite.config.ts, which knip can't follow
    "some-babel-plugin"
  ]
}
```

**Noise has known causes:**

- **Content collections and data folders** loaded by glob: negate them in `project` (`"!<folder>/**"`). Don't narrow `project` to `src/**/*.{ts,tsx}` instead: the framework's files silently drop out of the analysis, and everything only they import looks unused.
- **Scripts run by path** (`node bin/x.mjs`): add them to `entry`. knip can't parse an extensionless shebang script, so for one of those, make the modules it loads the entries.
- **Test files reported unused:** the test runner isn't recognized (custom wrappers, `node --test` through another binary). Add the test glob to `entry`.
- **Dependencies used by string** in a config: `ignoreDependencies`, with the reason.

**Cleanup PR:** delete what's verifiably dead (grep before deleting), remove unused exports or make them file-local, and drop unused dependencies. Then add `deadcode: knip` and a CI step. Once it reports zero, the step is the gate and `knip --cache` can join the Stop hook.

knip doesn't track object properties, so a dead export can be the only reader of metadata on live entries (a name or description on each). Once the export goes, delete that metadata too.

**Narrow ignores:** `ignore` hides every issue type in a file. `ignoreFiles` only keeps it out of the unused-files report, and `ignoreIssues` silences one issue type for one file (`"postcss/plugin.js": ["exports"]`). Use the narrowest one that fits. Resolve knip's "Configuration hints" too (redundant entries, unused ignores), except the entries the reachability walk needs (below).

**Fix noise in this order.** Unused exports used only by tests disappear once the tests are entries, so fix the test entries first, then re-read the export list.

**Reachability walk:** copy `assets/scripts/find-dead-code.mjs` and `resolve-module.mjs` to `anti-slop/`.

- It walks imports from knip's `entry` files through knip's `project` files and lists files no entry reaches. It reads aliases from tsconfig `paths`, and skips what `!` negations, `ignore`, `ignoreFiles`, and `.gitignore` exclude.
- **It only knows explicit entries.** Framework entry points that knip's plugins find on their own (pages, routes, the framework config, content config) must be listed in `entry` for the walk. knip will hint "Remove redundant entry pattern" for them; keep them, and say why in a comment.
- **Every entry must also match `project`.** An entry outside `project` (a root `*.config.mjs`, say) is silently dropped, and everything only it imports shows up as dead.
- A file kept on purpose carries `@dead-code-allow` in its first 200 characters.
- Modules loaded by `import.meta.glob` or by string need an entry or that marker.
- Script: `dead-files`. **Prove it works:** add an unreferenced file, see it reported, delete it.

**Stale mocks:** copy `find-dead-mocks.mjs` when the project uses `vi.mock`. It checks that mocked modules exist and that factory keys are real exports. Script: `dead-mocks`. Prove it with a mock of a renamed export.

## 9. Duplicates

**jscpd 5.4+.** It respects `.gitignore`, resolves config paths relative to the config file, and can compare against a git ref.

**Two configs, because repeated markup is often fine and repeated logic isn't:**

```jsonc
// .jscpd.json: logic, the stricter one
{ "path": ["src"], "format": ["typescript", "javascript"], "ignore": ["**/*.test.*", "**/*.spec.*", "**/fixtures/**", "**/generated/**"], "minLines": 6, "minTokens": 40, "reporters": ["console"] }
```

```jsonc
// .jscpd.markup.json: components and styles, larger blocks only
{ "path": ["src"], "format": ["tsx", "jsx", "css", "scss"], "ignore": ["**/*.test.*", "**/generated/**"], "minLines": 15, "minTokens": 100, "reporters": ["console"] }
```

**Scripts:**

- `dup`: `jscpd && jscpd --config .jscpd.markup.json`. Full report, never fails.
- `dup:new`: both configs with `--baseline-from-ref origin/<default-branch> --fail-on-new-clones`. Fails only on clones the branch adds; CI runs this while there's a backlog.

**At zero clones, drop the baseline.** Baseline mode is for a backlog. Once the count is zero, set `"threshold": 0` in each config and run jscpd plain: it fails on any clone and takes well under a second on a mid-size repo, against about 11 s for the baseline compare. That's cheap enough for pre-commit as well as the Stop hook and CI.
- `dup:top`: `jscpd -r json -o reports/jscpd -s && node anti-slop/jscpd-top.mjs`. Groups the backlog by fragment for triage. Copy `assets/scripts/jscpd-top.mjs`.

**The backlog** goes into later plan steps: one PR per worthwhile merge, named in the plan.

**Semantic duplicates** (same logic written differently): `jscpd --semantic` compares function embeddings with a local model it downloads once (548 MB). Run it from the weekly report, not CI.

## 10. CI gate

**A step per check, a job per file set.** Each check is its own named step, so a failure shows in the UI without digging through a combined log. Without a changes job (every check runs on every PR), fast whole-tree checks that share an install run as steps of one job, since each job pays for checkout and install (often a minute or more); a slow check or one with its own setup (build, e2e, mutation) gets its own job. With a changes job (below), the job is what gets skipped, what reports as a required check, and what gets rerun, so it's one job per file set: checks share a job only when their filters match the same files or one filter sits inside the other. The job's `if:` is the wider filter, and the narrower check's step carries its own. Checks with different filters get separate jobs, so each skips on its own and shows its own status. In one job, the `if:` would be the union of their filters, every step would need its own guard, a green job would stop saying which checks ran, and setup only one check needs (type generation, say) would run for all of them; the install saved only matters on PRs that match several filters. The `detectors` job below holds deadcode and dup because jscpd's filter sits inside knip's. Detectors join as they reach their gate. Deploys depend on the jobs (`needs:`).

- **Every step after the first needs `!cancelled()` in its `if:`,** even a step that already has a filter: `if: ${{ !cancelled() && needs.changes.outputs.dup == 'true' }}`. A custom `if:` without a status function gets an implicit `success() &&`, so one failed check silently skips the rest.
- **A check that needs another job's output** runs as a step of that job, not as a new job that checks out again and downloads the artifact: minutes of setup for a compare that takes a second.
- **Job names are the required-check names** in branch protection. Adding, renaming, or merging a job is a settings change outside the repo: list it in the PR description.

The worked example is GitHub Actions, matching the project's existing setup steps; CI in Adapting to the stack covers other providers:

```yaml
  detectors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      # the same pnpm/node setup and install steps the other jobs use
      - name: deadcode
        run: pnpm deadcode
      - name: dup
        if: ${{ !cancelled() }} # still runs when the step above fails, so one run reports both
        run: pnpm dup
```

**Fetch history for diff-based jobs:** `dup:new` and react-doctor on the diff need the full history and the PR's target branch as the base ref (GitHub Actions: `fetch-depth: 0` and `origin/${{ github.base_ref }}`).

**Match the repo's hardening:** copy what the other jobs do (on GitHub: pinned action SHAs, `permissions:` blocks, `persist-credentials: false`).

**Path filters** (GitHub `on.pull_request.paths`, GitLab `rules: changes:`) save CI minutes, but they have traps:

- **List everything that changes the result:** the check's own config, any config it extends, `package.json` (the script's flags), and the CI config itself.
- **GitHub: a workflow skipped by `paths:` reports no status,** so as a required check it blocks every PR it skips. Don't put `paths:` on a required check; use a changes job (below).
- **GitHub's filter syntax has no brace expansion,** so each extension needs its own line (`'**.ts'`, `'**.tsx'`).

**Skipping required checks: a changes job.** Worth it when many PRs touch no code (the audit's probe counts recent commits that touched no code or config). A first job lists the PR's files and sets one output per check, and each check's job carries an `if:` on its output. A job skipped by `if:` reports success, so it can stay required:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      lint: ${{ steps.filter.outputs.lint }}
      detectors: ${{ steps.filter.outputs.detectors }}
    steps:
      - id: filter
        uses: actions/github-script@<pinned>
        with:
          script: |
            const pr = context.payload.pull_request;
            // A rename counts both paths; a deleted file is listed under its own name.
            const files = pr && (await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: pr.number }))
              .flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
            // Inputs every check reads: the manifest, the lockfile, the Node version, this workflow.
            const shared = /^(package\.json|pnpm-lock\.yaml|\.nvmrc|\.github\/workflows\/ci\.yml)$/;
            const checks = {
              // a type-aware linter also reads imported JSON and framework frontmatter
              lint: /\.([cm]?[jt]sx?|json|astro)$/,
              // knip's plugins read the configs they know: anything outside the content folders
              detectors: /^(?!src\/content\/|public\/)/,
            };
            for (const [name, re] of Object.entries(checks)) {
              // no PR payload (a push, a manual run): run everything
              core.setOutput(name, !files || files.some((f) => shared.test(f) || re.test(f)));
            }
  lint:
    needs: changes
    if: needs.changes.outputs.lint == 'true'
    # …
```

- **The changes job must itself be required.** If it fails, every job that needs it is skipped, and skipped satisfies a required check.
- **Shared inputs run every job:** the manifest, the lockfile, the Node version file, the workflow itself.
- **Each filter covers what the tool reads indirectly,** not only the files it checks: the type-aware linter's imported JSON and frontmatter, the configs knip's plugins load.
- **A job running several checks** holds only checks with the same or nested filters: the job takes the wider filter as its `if:`, and the narrower step adds its own with `!cancelled()`. Checks with different filters get separate jobs.
- **The PR that adds the changes job can't verify the skip:** every push there changes the workflow, a shared input, so everything runs. Say so in the PR description and check on the next content-only PR.

**Cancel superseded runs per branch.** GitHub: a `concurrency` group keyed on `github.ref` (`group: ${{ github.workflow }}-${{ github.ref }}`); a group shared across PRs cancels another PR's pending run, even with `cancel-in-progress: false`. GitLab: `interruptible: true` on the jobs, and the project's auto-cancel setting does the rest per ref.

**Add each gate in the step that gets its check to zero,** not before.

## react-doctor

Every React project gets it in the review flow, in three parts: set it up as a plain command, clean up the errors, then gate on them.

**Setup** goes in with the other detectors, with no gate yet. **Set it up by hand rather than with `react-doctor install --yes`.** That command also writes a pre-commit block straight into `.git/hooks` (unversioned, and alongside whatever lefthook or husky put there) and adds a `doctor` script that runs `npx react-doctor@latest` with no release-age gate and telemetry on, which `pnpm doctor` shadows anyway. Instead:

- **Don't install it.** Run it through `npx -y --min-release-age=7 react-doctor@latest` everywhere: the newest version at least a week old, so a hijacked release is usually caught and pulled before it runs here. The gate matters even with a pinned version: npx has no lockfile, so the tool's caret-ranged dependencies resolve fresh on every run. `-y` stops npx from prompting in a terminal; hooks and CI have no TTY and already assume yes.
- **Check npm where it runs, CI included.** npm older than 11.10 warns that `--min-release-age` is unknown and then ignores it, so the release-age gate is silently off. Check which npm the CI's Node version ships (`npm --version` in a job), and upgrade npm or Node in the job if it's older.
- **Add a script:** `"react-doctor": "npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain"`. In a single-package repo, add `--project .` to that and to the hook and CI commands below: react-doctor otherwise also scans nested projects in gitignored folders, like worktrees. By default it reports usage, and its supply-chain scan sends the dependency list to Socket.dev. If the team wants that scan, they can drop the flag knowingly.

**Errors are mandatory, and get cleaned up before any gate:**

- **Fix every error,** in one cleanup step or several, split by directory or rule when they don't fit one PR. Gating first would hand the backlog to whoever next touches a file with an old error.
- **Before calling one a false positive,** check whether cleanup happens another way (an array of observers disconnected together, say). Build-time `eval` or import-metadata findings in scripts are usually intentional: exclude those paths in config, with the reason.

**Triage notes:**

- **Suppressions go in react-doctor's config file:** `doctor.config.json`, `.jsonc`, or `.ts` (the docs list the other extensions), or a `reactDoctor` key in `package.json`. JSON configs allow comments. A false positive gets a per-file entry under `ignore.overrides` (`{ "files": [...], "rules": [...] }`), each with a comment saying why. `ignore.rules` drops a rule project-wide and `ignore.files` skips a file entirely: keep those for documented patterns and whole path categories.
- **Hydration gates in SSR and islands frameworks:** `react-doctor/no-initialize-state` and `react-doctor/rendering-hydration-no-flicker` misfire on the "set state after mount" gate, just like the effects plugin's `no-initialize-state` (section 3). When the project documents that pattern, suppress both project-wide in `ignore.rules`, with the reason.
- **`no-high-complexity-react-function`** counts only the component's own body (ternaries, `&&`, `||`), not nested callbacks, so extracting a `.map` callback changes nothing. Move a whole branch into a child component or a lowercase helper instead.
- **It reads the project's lint config.** react-doctor merges the JSON oxlint or ESLint config, so a lint config change can change its findings: add that config to the gate's path filter (section 10). If the config is type-aware, CI runs the framework's type generation (such as `astro sync`) before the scan.

**Gate once errors are zero,** in the hook and CI together. With a clean codebase, `--blocking error` fires only on errors a change introduces.

- **Hook, always scoped:** `npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain --scope changed --base HEAD --include-untracked --blocking error` in the Stop hook.
- **CI, a full scan when it fits the PR budget:** `npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain --blocking error`. A scoped scan saves less than it seems, because startup takes a big share of either. A full scan needs no git history, and it catches what a changed-files scope can't, such as a removed suppression or a changed lint config. Only when it doesn't fit, scope it with `--scope changed --base origin/<target branch>` and fetch the full history (section 10).
- `react-doctor ci install` generates a GitHub Actions workflow that also comments findings on PRs; use it instead if the team wants the comments, and add the release-age gate and flags.

**Warnings report by default:** they don't block. Fix them in code a PR already touches. A rule with a real cluster of hits can become its own cleanup step; the rest stay in the scheduled report.

**If the team wants warnings to block too** (the audit asks), they get the errors' path: a warnings cleanup step, split by rule group if it gets long, then the gate with `--blocking warning`. If the error gate is already in, that step only switches the flag.

**Keep the scheduled full run after the gate.** `@latest` brings new rules with each release. Without the scheduled run, a new rule first shows up as a block on some unrelated PR.

**The score is a diagnostic.** Don't put a number on it in CI.

**`react-doctor design` is opt-in.** It runs the UI design rules that a full scan leaves out, and it's cheap. Triage its first run like any new rule.

- **It exits 0 when it has findings,** even with `--blocking`. A gate checks the `diagnostics.json` it writes to `--output-dir` instead: `npx -y --min-release-age=7 react-doctor@latest design --no-telemetry --output-dir reports/react-doctor-design && jq -e 'length == 0' reports/react-doctor-design/diagnostics.json`.
- **It scans framework template files** (`.astro`, `.vue`, `.svelte`), so their extensions belong in the hook's file glob and the CI path filter.

**Its agent skill is optional.** The package ships one at `dist/skills/react-doctor/`; `npm pack --min-release-age=7 react-doctor@latest` fetches it. The Stop hook already gives the agent the findings, so the skill is extra guidance on how to fix them. If the team wants it, copy it into the agent's skills directory and adjust it in the PR: add `-y --min-release-age=7` and `--no-telemetry --no-supply-chain` to its `npx react-doctor@latest` calls, and drop the rule that treats a score drop as something to fix. Its `/doctor` flow fetches a playbook from react.doctor at run time; keep that section only if the team is fine with the agent following remote instructions.

## Trim the rules file

The last step of the plan. A rules file is read once per session and competes for the model's attention, so a line that a check now enforces is a second copy of the rule: the check catches what the line asked for whether or not the model read it, and the two drift apart when the config changes.

**Inventory what blocks.** A check enforces a rule only where it fails: a tsconfig flag, a lint rule at `error`, a warning the hooks deny on changed files, a boundary policy, a project rule in `anti-slop/lint-rules/`, knip or jscpd at their gate, react-doctor with `--blocking`, the Stop hook, pre-commit, and the CI jobs. The plan's status table and `todo.md` list most of it; the configs settle the rest. A warning that CI only prints isn't enforcement yet: its line stays until the rule is promoted.

**Read every rules file** the probe lists (its `scars` section prints their prohibition lines, code-like ones first), plus the files they import. For each line that tells the model what to do or not do:

- **A check fails on exactly what the line forbids** ("never use `any`" with `no-explicit-any` as an error, "no effects for derived state" with the effect rules, "services don't import components" with its boundary policy, "run the tests before you finish" with the Stop hook): delete the line. If it carried a reason the rule's message doesn't, move the reason into the message.
- **A check covers the mechanical part and the line carries judgment** ("prefer `Map` over an index lookup that may miss" next to `noUncheckedIndexedAccess`): cut it to the judgment half.
- **No check covers it:** keep it. If it's machine-checkable, it's a scar-rule candidate: add it to the plan's table rather than writing the rule in this step.

The rollout's own Conventions section gets the same test: its "no new `!`, `as any`" clause goes once those rules are errors, while "fix, don't silence" stays, since nothing checks for a new disable comment. The commands list stays as it is: it's how the model runs the checks.

**Keep** what no check sees: product context, architecture, where things live, how to run the app, review conventions. The step makes the file shorter, not emptier.
