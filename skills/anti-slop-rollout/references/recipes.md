# Recipes

Read **Adapting to the stack**, **Conventions**, and **Running often**, then only the section for the step you're doing. Pick each tool from the plan's **Stack**, and follow its **Variants** where a section gives two options. Package versions below are the ones verified when this was written. Add the current versions with the project's package manager, and check a tool's `--help` when a flag here doesn't match.

Contents: [Adapting to the stack](#adapting-to-the-stack) · [Conventions](#conventions) · [Running often](#running-often) · [1 Contract](#1-api-contract) · [2 Strict TS](#2-strict-typescript) · [3 Linter rules](#3-linter-rules) · [4 Boundaries](#4-boundaries) · [5 Scar rules](#5-scar-rules) · [6 Agent rules and hooks](#6-agent-rules-and-hooks) · [7 Mutation testing](#7-mutation-testing) · [8 Dead code](#8-dead-code) · [9 Duplicates](#9-duplicates) · [10 CI gate](#10-ci-gate) · [react-doctor](#react-doctor) · [Trim the rules file](#trim-the-rules-file)

## Adapting to the stack

**Linter.** Every rule set in these recipes is an ESLint plugin.

- **ESLint (flat config):** add the plugin as a devDependency and spread its config into `eslint.config.*`.
- **oxlint:** native rules go in `.oxlintrc.json` under their plugin (`typescript/`, `import/`, `react/`, `jsx-a11y/`, `vitest/`, `jest/`). ESLint plugins load through `"jsPlugins": ["eslint-plugin-sonarjs", ...]`, resolved from the config's directory; their rules are named after the plugin without `eslint-plugin-` (`sonarjs/cognitive-complexity`). oxlint can't load a plugin's preset, so list the rules. The audit probe already built that list: `probe.json` → `lint.config` points at a working config with absolute paths. Copy its rules and replace the paths with package names.
  - **Keep the list in `.oxlintrc.json`.** react-doctor reads only JSON lint configs, so rules loaded through `oxlint.config.ts` drop out of its scan and its findings diverge from the linter's.
  - **Run the plugins on the project's oxlint before wiring.** The probe runs `oxlint@latest`, and an older pinned oxlint can crash with JS plugins loaded. Lint the whole tree with the plugins on the installed version first. If it crashes, upgrade oxlint and its type-aware companion (`oxlint-tsgolint`) in the same PR, and confirm the old config reports the same count under the new version. Name both versions in the PR and the Log.
- **Biome** can't load ESLint plugins. Add oxlint next to it for the plugin rules only (`"categories": {}` so it doesn't duplicate Biome's rules). It runs in seconds. Don't migrate the project off Biome.

**Package manager.** Commands below write `<run> <script>`: the project's script runner (`npm run`, `pnpm`, `yarn`, or `bun run`), from the plan's Stack. CI setup steps copy the ones the project's other jobs use. In a monorepo, a check's config goes where its tool runs: per package, or at the root with workspaces (knip's `workspaces`, an ESLint config per package).

**Template files.** oxlint and ESLint processors see only the script part of `.astro`, `.vue`, and `.svelte` files, so anything used only in the template looks unused. Turn off `sonarjs/unused-import`, `sonarjs/no-unused-vars`, and `sonarjs/no-dead-store` for those globs in an `overrides` entry, with a comment saying why. oxlint's native `no-unused-vars` and `no-useless-assignment` do see template usages, so an oxlint list that swaps those three for them (section 3) needs no override.

**Changed files only.** New rules land as warnings, and the hook that checks changed files treats warnings as errors (`oxlint --deny-warnings <files>`, `eslint --max-warnings=0 <files>`). New and touched code must pass, while the backlog doesn't block anyone. CI runs the full lint without failing on warnings until the rule is promoted.

**Git hooks.** Use what the project has:

- **lefthook:** add a job to the `pre-commit` group, and to the group the agent hook runs if there is one. Its globs match paths without a separator, so `**/*.json` misses root files like `package.json` and `tsconfig.json`: write `*.{js,ts,json}`.
- **husky** with lint-staged or nano-staged: add a glob entry.
- **simple-git-hooks:** edit its command.
- **Nothing:** add `nano-staged` with `simple-git-hooks`, the lightest pair.

**CI.** The recipes show GitHub Actions; the project's existing CI config says which provider it has. Keep the shape in that provider's syntax: a named step per check and a job per file set (section 10), full history and the PR's target branch fetched for diff-based jobs, non-blocking for the slow ones, a PR comment posted through the forge CLI. The bundled scripts take the base ref as an argument and print markdown, so they run anywhere. GitLab: `GIT_DEPTH: 0` for full history, `git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"` for the base ref, `glab mr note` for the comment.

**Package scripts.** Name them after what they do (`deadcode`, `dup`, `mutation`), match the existing naming style (`lint:scripts` vs `lint-scripts`), and call the tool directly, not through `npx`. Don't reuse a package manager built-in: `pnpm doctor`, `pnpm audit`, `pnpm outdated`, `npm doctor` and friends run the built-in instead of your script, exit 0, and look like success.

**Where things go.**

- **Tool configs** live at the root, where the tools look for them: `knip.jsonc`, `.jscpd.json`, `stryker.config.json`.
- **Scripts, the agent hook, and the project's own lint rules** outlive the rollout, so they go in the project's tooling folder: `scripts/`, `tools/`, or `bin/`, whichever it has, or `scripts/` if none. The recipes below write `scripts/`. The bundled scripts resolve the repo root as their parent directory, so the folder sits at the root and they go directly in it: `scripts/find-dead-code.mjs`, `scripts/lint-rules/`.
- **`anti-slop/`** holds only `plan.md` and `todo.md`. The plan's last step deletes it.
- **Report output** goes to `reports/` (gitignored).

## Conventions

Add a section to the project's agent rules file (AGENTS.md, or CLAUDE.md if that's what the project uses) the first time a rollout step runs. Match the file's voice and keep it short: the file competes for the model's attention.

```markdown
## Anti-slop checks

Rolled out step by step from `anti-slop/todo.md`; the reasoning is in `anti-slop/plan.md`.

- Fix what a check finds; don't silence it. No new `!`, `as any`, `@ts-expect-error`, or disable comments to get a check green.
- Lint warnings fail the hooks on changed files and only print in CI, so a new rule starts as a warning that touched code must pass. The agent hook also runs whole-project checks (typecheck, tests), so it can report a file the change didn't touch.
- Every ignore entry (knip `ignore`, jscpd `ignore`, lint `overrides`, a disable comment) carries a comment saying why. Review the lists when they grow: each entry is code a detector was told not to look at.
- A lint message says what failed, why the rule exists, and what to do instead.
- A project lint rule (`scripts/lint-rules/`) names the incident behind it (a commit, PR, or bug), or, for a rule that cancels a default the model brings from other codebases, the measured cost of that default. Neither, no rule.
- After fixing a bug, or a regression a review catches, suggest the lint rule or test that would have caught it (the incident, what it matches, its message), or say why no check can. Write it only when asked.
- After writing tests for a pure module, run `<mutation command>` on it, and kill each survivor with an assertion or say why it's equivalent.
- Scores (react-doctor, mutation) are diagnostics, not targets. Don't change code to move a number.

Commands:

- `<cmd>`: <what it checks, when to run it>
```

Drop the lines about tools the plan doesn't use. If the file already has a commands list, put the commands there and leave only the conventions in this section. Either way, each later step adds its commands in the same place.

## Running often

Each check runs at the cheapest moment that still catches what it's for. The plan's **When checks run** table decides this for the project, using timings measured there. The table below is the default the audit starts from.

**When wiring a check,** put it where the plan's table says, then time it with the installed tool. If it's now over that moment's budget, move it to the next moment, and update the table and the Log.

**Time a CI job on CI,** not locally. Checkout and setup (installing browsers with `--with-deps`, say) can double an e2e run. A job over the PR budget runs non-blocking (`continue-on-error`) and stays out of the required checks.

| When | What | How |
|---|---|---|
| Every agent turn and commit, on changed files | lint rules (presets, boundaries, project rules) | the agent hook and pre-commit (section 6) |
| Every agent turn, on changed files | react-doctor `--scope changed --base HEAD`, when the plan gates it | the agent hook only: its startup alone takes most of the pre-commit budget |
| Every agent turn, whole project but fast | typecheck on a clean baseline, the unit suite, knip at zero (with `--cache`), jscpd (a plain run at zero clones, or baseline mode) | the agent hook, once the check reports new findings only and while the whole hook stays under budget (section 6); a sub-second one can join pre-commit too |
| Every PR | typecheck, unit tests, knip, jscpd new clones vs the base branch, react-doctor when the plan gates it (a full scan, or on the diff when that doesn't fit; blocks on errors once they're zero), mutation testing on changed files (required or report-only, per the plan's Variants) | CI, a named step per check (section 10) |
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
      # the same package manager and Node setup and install steps the other jobs use
      # <run>: the project's script runner, silenced (`npm run -s`, `pnpm -s`, `yarn -s`, `bun run --silent`)
      - run: |
          {
            echo '## Duplicates'; <run> dup:top || true
            echo '## react-doctor'; <run> react-doctor | tail -n 40 || true
            echo '## Mutation'; <run> mutation | tail -n 40 || true
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
- Give literal tables tuple types (`as const`, or `[number, number, number]`), so a fixed index is known to exist.
- An index loop that reads two arrays by one index becomes one array of records (`{ label, value }`), so there's no second lookup to guard.
- Where absence means an upstream bug, throw a named error instead of defaulting: a default hides the bug, and the error names it.

**Never `!`.** Section 3's `no-non-null-assertion` should already be an error, so the shortcut fails lint.

**`exactOptionalPropertyTypes`** goes in when the plan's variant says so: always on, or count-gated. Write `prop?: T | undefined` where `undefined` is passed on purpose, and use conditional spreads (`...(x !== undefined && { x })`) where it isn't.

**Framework checkers:** if the project also runs `astro check`, `vue-tsc`, or `svelte-check`, those must pass too. They see files tsc doesn't.

**JavaScript projects:** `checkJs` with JSDoc types gets the same checks. Turn it on per directory (a `// @ts-check` header, or a `jsconfig.json`/`tsconfig.json` with `allowJs` and `checkJs` per folder), the way a large flag splits.

**Too many errors for one PR** (the plan says when): split by top-level directory. Each PR fixes one directory with the flag set only locally (`tsc --noEmit --noUncheckedIndexedAccess | grep '^src/<dir>/'`). The last PR flips the flag in `tsconfig.json`.

## 3. Linter rules

| Rule set | ESLint | oxlint |
|---|---|---|
| sonarjs | `eslint-plugin-sonarjs`, `sonarjs.configs.recommended` | `jsPlugins: ["eslint-plugin-sonarjs"]` plus the rule list |
| unnecessary effects | `eslint-plugin-react-you-might-not-need-an-effect`, `.configs.recommended` | `jsPlugins`, rules `react-you-might-not-need-an-effect/*` |
| test assertions | `@vitest/eslint-plugin` (`expect-expect`, `no-focused-tests`) or `eslint-plugin-jest` | native `vitest/expect-expect`, `vitest/no-focused-tests` (or `jest/…`) |
| e2e | `eslint-plugin-playwright`, `configs['flat/recommended']` on the e2e glob (Cypress: `eslint-plugin-cypress` recommended) | `jsPlugins`, rules in an `overrides` entry for the e2e glob |
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
    "no-useless-assignment": "error",
    "vitest/expect-expect": "error",
    "vitest/no-focused-tests": "error",
    // sonarjs recommended, listed: a JSON config can't load a preset. Left out: no-unused-vars and
    // unused-import (oxlint's no-unused-vars), no-dead-store (no-useless-assignment), and the
    // rules for libraries this project doesn't use (aws-*, Vue, Angular, lodash, …).
    "sonarjs/cognitive-complexity": "warn"
    // …the rest of that list and the effect rules, as warnings
  },
  "overrides": [
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

**Native-rule equivalents.** Before leaving out a sonarjs rule as covered by oxlint, check that the native rule is on:

| sonarjs | oxlint | On by default |
|---|---|---|
| `no-unused-vars`, `unused-import` | `no-unused-vars` | yes, in `correctness` |
| `no-dead-store` | `no-useless-assignment` | no: turn it on at `error` |

**Type-aware JS-plugin rules can be inert under oxlint,** which passes JS plugins no type information. A rule's `meta.docs.requiresTypeChecking` flag is only a hint: some flagged rules still fire, others never do. The probe splits the flagged rules into those that fired and those that stayed silent (`lint.typeAware`). Don't count a silent one as coverage, in the plan or in the rules-file trim, until a plant fires it.

**Trim the list by stack.** Leave out the sonarjs rules for libraries the project doesn't depend on (`aws-*`, Vue, Angular, lodash, …); the probe's `lint.config` already has. Cut rules are left out of the list, never written as `"off"`. One comment above the list names each cut and why, so a re-audit knows what to add back when a stack lands.

**Fix patterns,** one rule per line:

- **`no-non-null-assertion`:** narrow on the value read (read `shift()` once into a const, `!!x?.length`); `flatMap` instead of `filter` then `map` with `!`. Where absence can only follow an upstream change, throw a named error: a default hides the bug, the error names it.
- **`consistent-type-definitions`:** the autofix. Where an `interface` breaks assignability to `Record<string, unknown>` (no index signature), a mapped type (`Record<'a' | 'b', string>`) passes the rule, so no disable comment.
- **`no-nested-conditional`:** an early-return helper, a lookup keyed by the discriminant (`Map` or object), an index into an ordered array, or one shared helper when two files wrote the same chain.
- **`cognitive-complexity`:** look for a repeated block first: a loop written twice, or a section two functions share, becomes one helper. Otherwise move a whole branch into a helper. Afterwards, inline each helper that has one caller and doesn't name a concept, wherever the parent stays under the threshold, and rerun jscpd.
- **`no-nested-template-literals`:** a ternary that picks between two whole templates, or a hoisted const.
- **Regex rules:** character classes instead of single-character alternatives; no `A-Z` next to `a-z` under the `i` flag; drop an alternative another one already matches. Prove a rewrite by running the old and new regex over the project's real inputs and comparing the matches.
- **`ban-ts-comment`:** its default allows `@ts-expect-error` with any description, and migration tools write one themselves, so count `@ts-expect-error`, `@ts-ignore`, and `@ts-nocheck` directly (the probe's `suppressions`) and treat a generated description as no reason. Each one becomes a real type: an ambient declaration for a global, a typed lookup map instead of an indexed object literal.
- **Effect rules:** state copied from the URL becomes a value derived in render; browser state (`document.readyState`, a media query) comes from `useSyncExternalStore` with an explicit server snapshot. On SSR and islands frameworks, an effect that sets state after mount to avoid a hydration mismatch is often legitimate: if the project relies on that pattern, keep `no-initialize-state` as a warning and document the pattern in the rules file, so the agent knows which hits are by design.

**Promoting** a rule means making it an error. When depends on the plan's backlog variant:

- **Gradual:** once it catches a real bug (a PR or review comment names it). Old code stays as-is: the changed-files hook clears its hits as files get touched. The warnings review step, a month after the rules land, promotes what caught something, deletes what only made noise, and leaves the rest as warnings until the re-audit.
- **Cleanup:** once its count is zero, or once it catches a real bug. The rest of this section is the cleanup variant.

**The end state has no `warn`.** The hooks block warnings in changed files, so a warning is an error that lands later, on whoever next edits the file in an unrelated PR. The preset's last step promotes every rule, `cognitive-complexity` included, once what's left can be split in one PR (about ten functions); otherwise the plan names a follow-up step. Delete a rule that produced only noise for a month. A rule that misfires on a whole path category (build scripts: `no-os-command-from-path`, `pseudo-random`) gets an override with a reason, not one disable at a time; a rule that's noise repo-wide but signal in one place stays out of the list and comes on through an override only there (`super-linear-regex` where a regex meets request input).

## 4. Boundaries

**For one to three rules,** use the linter's native `no-restricted-imports` in an `overrides` entry per directory. It needs no plugin, and the `message` field carries the reason:

```jsonc
{
  "rules": {
    // repo-wide, so it also covers scripts and tests
    "no-restricted-imports": ["error", { "patterns": [{
      "group": ["**/routes/**"],
      "message": "Routes only map URLs to pages, so nothing imports from them. Move the shared code into a module both can import."
    }] }]
  },
  "overrides": [{
    // everything that ships to the browser; server-only code lives in src/server/
    "files": ["src/{components,hooks,layouts,utils}/**/*.{ts,tsx}"],
    "excludeFiles": ["src/**/*.test.{ts,tsx}"],
    "rules": {
      "import/no-nodejs-modules": "error",
      "no-restricted-imports": ["error", { "patterns": [
        {
          "regex": "(^|/)server/",
          "allowTypeImports": true,
          "message": "Server-only code (Node APIs, secrets) breaks the client bundle (<incident commit>). Compute the value on the server and pass it as a prop, use `import type` for a type, or inline a build constant through the bundler's define. Code that needs server APIs goes in src/server/."
        },
        // the top-level pattern again: this entry replaces it instead of merging
        { "group": ["**/routes/**"], "message": "<the same message>" }
      ] }]
    }
  }]
}
```

- **The plan step names the server-only modules** (the audit walks the import graph up from the direct readers of `process.env`, `child_process`, `fs`, and `crypto`). Move them into one folder (`src/server/`) first, so the pattern matches the folder: a name list goes stale with the next util.
- **Scope the override to every module that ships to the browser,** utils included, with tests in `excludeFiles` (`ignores` in ESLint's flat config). A partial scope leaves a plain util as the way around the rule.
- **`allowTypeImports: true` on each pattern:** `import type` is erased at build time, so it can't pull a module into the bundle. In ESLint, that option lives in `@typescript-eslint/no-restricted-imports`, not the core rule.
- **Ban Node built-ins with `import/no-nodejs-modules`** (native in oxlint, `eslint-plugin-import` in ESLint), not a `node:*` group, which misses a bare `fs`, or a hand-written list, which misses built-ins.
- **An override's `no-restricted-imports` replaces the top-level options instead of merging them,** so every override that sets the rule restates the repo-wide patterns.
- **The rule sees direct imports only.** It can't tell that a new util outside the folder reads `process.env`, so the rules file keeps one line stating that limit and the folder convention.
- **Verify on the incident and on plants.** Lint the pre-fix file (`git show <sha>^:<path>`) saved under a path the override matches: it must fire. Then plant one violation per pattern and one allowed form of each kind (`import type`, a JSON config import): each plant fires with its message, and each allowed form passes.

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

The template is in `assets/lint-rules/`. Copy it to `scripts/lint-rules/`, delete the example rule, and write the project's rules. Each rule has three parts:

- **Matcher:** as narrow as the defect's pattern, and as wide as its source. When a tool or a habit produced the bug (a design tool's export, a copied snippet), check everything that source produces, not only the files the fix touched.
- **Message:** what failed, why (the incident in one sentence, with numbers if there were any), and what to do instead. A default override has no incident: its message carries the measured cost of the default it cancels (bytes shipped, renders, a timing on a realistic input).
- **`docs.url`:** the PR, issue, or commit; for a default override, the PR that wrote the convention.

**Count with the real rule before picking the level.** The audit's count comes from a naive scan and is an upper bound. The rule resolves what the scan guessed at, and its count decides warning or error. A hit in dead code gets deleted, not fixed.

**Loading:**

- **oxlint:** `"jsPlugins": ["./scripts/lint-rules/index.cjs"]`. Rules are `local/<name>`, from the plugin's `meta.name`.
- **ESLint:** `import local from './scripts/lint-rules/index.cjs'`, then `{ plugins: { local }, rules: { 'local/<name>': 'error' } }`.

**Testing,** with no fixture files, so lint, knip, jscpd, and tsconfig need no ignore entries for them:

- **oxlint:** `lint-rules.test.mjs` writes throwaway sources and a minimal config into a temp dir, runs the linter with JSON output, and checks each rule fires exactly where it should. Give each rule a violating and a clean source.
- **ESLint:** use `RuleTester` from `eslint` with `node:test` (set `RuleTester.describe = describe; RuleTester.it = it`) instead.
- **Check the unit-test script runs them:** its glob or command often misses `scripts/`.

**Prove it on the incident.** Run the rule against the code from before the fix (`git show <fix-sha>^:<file>`). It must fire there.

**CSS scars** (a stylelint rule) follow the same idea with `stylelint.createPlugin`. Put them in `scripts/lint-rules/stylelint/` and test them by linting inline CSS through stylelint's Node API (`stylelint.lint({ code, config })`).

**Scars in files no import reaches** (SVGs, images, content data) are a unit test that walks those files, not a lint rule. Add the files to the test's CI changes filter and to the agent hook's trigger: a filter keyed on code skips a change that touches only assets.

## 6. Agent rules and hooks

**Rules file:** add the Conventions section above.

**Agent hook.** One script, wired into every agent in the plan's Stack that has an after-turn hook:

- **If the project already has one,** add the new checks to whatever it runs.
- **If not,** copy `assets/agent-check.sh` to `scripts/agent-check.sh`, delete the lines for tools the project doesn't use, and keep the lint line for the project's linter (the script has oxlint, ESLint, and Biome forms).
- **Claude Code:** a `Stop` hook in `.claude/settings.json`, as the script's header shows.
- **Other agents** (Cursor, Codex, Gemini CLI, Copilot): wire the same script to the agent's own after-turn hook if it has one. Check its current docs for the event name and how a hook sends findings back. An agent without one is covered by pre-commit only: say so in the PR and in the plan's Assumptions.

The hook exits 2 so Claude Code sends the findings back and the agent fixes them before it finishes. It stands down on the second block in a row so an unfixable finding can't loop. That's why one block must carry every failure: the script runs its checks in parallel and reports them all. A hook that chains checks with `&&` reports only the first failure, and the stand-down then skips the rest until the next prompt.

**Whole-project checks join the hook** once they report new findings only: typecheck on a clean baseline, the unit suite, knip and jscpd at zero. Changed-files lint sees only the files it lints, so when a function gains a required parameter, only the typecheck reports its unchanged callers. Add them while the whole hook stays within the plan's budget, timed with and without a code change.

**Trigger each check on what it reads.** The template lints changed source files, but runs the whole-project checks on any change outside the content folders: tsc and the tests read imported JSON, `package.json`, and `tsconfig.json`, and knip's plugins read the configs and workflows they know, so a turn that edits only one of those can still break the build or orphan a module.

**Pre-commit:** the file-scoped lint, plus any whole-project check that takes under a second (jscpd at zero, section 9), through the project's hook tool (see Adapting to the stack). It covers humans and every agent that commits.

## 7. Mutation testing

**Packages:** `@stryker-mutator/core` plus the runner (`@stryker-mutator/vitest-runner` or `@stryker-mutator/jest-runner`).

**No dedicated runner** (`node:test`, Bun): Stryker's command runner, with `coverageAnalysis: "off"`. It reruns its command once per mutant, so keep `mutate` to the pure-logic modules the plan names, and:

- **Run the module's sibling tests, not the suite:** `"commandRunner": { "command": "node --test <the module's test files>" }`. The whole suite costs several times more per mutant, and suite tests that read large asset folders make the sandbox copy them too. In a big repo, `ignorePatterns` keeps the sandbox to source.
- **Leave `testRunner` at its default:** `command` is built into core. knip's Stryker plugin turns an explicit `"testRunner": "<name>"` into a required `@stryker-mutator/<name>-runner` dependency.
- **No `incremental`:** the command runner reports one test with no file, so Stryker can't see that a test changed, and keeps reporting survivors that new tests already killed. A narrow scope reruns in seconds anyway.
- **A wrapper script beats a fixed config:** `mutation <module…>` maps each module to its sibling tests, runs Stryker on that pair, and holds the reasons a JSON config can't. It runs on any tested module, which the Conventions line about mutation needs.

**`stryker.config.json`:**

- `testRunner`, `coverageAnalysis: "perTest"`, `incremental: true` with `incrementalFile: ".stryker-incremental.json"` (commit it, so CI reuses results). Incremental works with dedicated runners only.
- `mutate`: logic directories only (services, lib, utils, stores), not components, tests, or generated code.
- Reporters `html`, `clear-text`, `progress`, plus `json` at `reports/mutation/mutation.json`.
- `thresholds.break: null`: **no failure threshold.**
- `tempDirName: "reports/stryker-tmp"`.
- If Stryker can't sandbox the project (TypeScript 7 dropped the programmatic compiler API), set `inPlace: true`.

**Scripts:**

- `mutation`: `stryker run`.
- `mutation:changed`: `stryker run --mutate "$(node scripts/changed-mutants.mjs origin/<default-branch>)"`. Copy `assets/scripts/changed-mutants.mjs`.

**CI:** a job on pull requests only, with full history (GitHub Actions: `fetch-depth: 0`). The plan's Variants say which kind:

- **Required:** in the branch's required checks. With `thresholds.break: null` it fails only when Stryker itself breaks, never on the score.
- **Report-only:** `continue-on-error: true`, and it stays out of the required checks, so a slow run never holds a PR.

Either way it runs these steps:

1. Compute the changed files with `changed-mutants.mjs`.
2. Run Stryker on them with `--reporters json`.
3. Build a comment with `scripts/mutation-pr-report.mjs` (from `assets/scripts/`).
4. Post it with `scripts/pr-comment.mjs` (section 10, **Gate or report**), which keeps one comment marked `<!-- mutation-report -->` up to date. Other forges: their CLI (`glab mr note`).

The comment lists surviving mutants on changed lines.

**Triage survivors.** A survivor is a missing assertion or an equivalent mutant, not a bug in the code. Kill it with an assertion, or log it as equivalent with the reason.

- **Usually equivalent:** a type-narrowing guard whose fallthrough already returns the same value; code reachable only through `NaN`; a boundary mutant outside the values the input can take; a lookup that already misses for the mutated key.
- **Real gaps cluster in** boundary values, missing vs. zero inputs, `else` branches, and empty-string fallbacks. The usual causes are shape asserted instead of content, an unverified snapshot, or a test that checks the mock.

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

**Cleanup PR:** delete what's verifiably dead (grep before deleting), remove unused exports or make them file-local, and drop unused dependencies. Then add `deadcode: knip` and a CI step. Once it reports zero, the step is the gate and `knip --cache` can join the agent hook.

knip doesn't track object properties, so a dead export can be the only reader of metadata on live entries (a name or description on each). Once the export goes, delete that metadata too.

**Narrow ignores:** `ignore` hides every issue type in a file. `ignoreFiles` only keeps it out of the unused-files report, and `ignoreIssues` silences one issue type for one file (`"postcss/plugin.js": ["exports"]`). Use the narrowest one that fits. Resolve knip's "Configuration hints" too (redundant entries, unused ignores), except the entries the reachability walk needs (below).

**Fix noise in this order.** Unused exports used only by tests disappear once the tests are entries, so fix the test entries first, then re-read the export list.

**Reachability walk:** copy `assets/scripts/find-dead-code.mjs` and `resolve-module.mjs` to `scripts/`.

- It walks imports from knip's `entry` files through knip's `project` files and lists files no entry reaches. It reads aliases from tsconfig `paths`, and skips what `!` negations, `ignore`, `ignoreFiles`, and `.gitignore` exclude.
- **It only knows explicit entries.** Framework entry points that knip's plugins find on their own (pages, routes, the framework config, content config) must be listed in `entry` for the walk. knip will hint "Remove redundant entry pattern" for them; keep them, and say why in a comment.
- **Every entry must also match `project`.** An entry outside `project` (a root `*.config.mjs`, say) is silently dropped, and everything only it imports shows up as dead.
- A file kept on purpose carries `@dead-code-allow` in its first 200 characters.
- Modules loaded by `import.meta.glob` or by string need an entry or that marker.
- Script: `dead-files`. **Prove it works:** add an unreferenced file, see it reported, delete it.

**Stale mocks:** copy `find-dead-mocks.mjs` when the project uses `vi.mock` or `jest.mock`. It checks that mocked modules exist and that factory keys are real exports. It reads test files under `src/`, `test/`, and `tests/` plus the Vitest or Jest setup file: adjust the globs to the project's. Script: `dead-mocks`. Prove it with a mock of a renamed export.

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
- `dup:top`: `jscpd -r json -o reports/jscpd -s && node scripts/jscpd-top.mjs`. Groups the backlog by fragment for triage. Copy `assets/scripts/jscpd-top.mjs`.

**At zero clones, drop the baseline.** Baseline mode is for a backlog. Once the count is zero, set `"threshold": 0` in each config and run jscpd plain: it fails on any clone and is fast enough for pre-commit as well as the agent hook and CI.

**The backlog** goes into later plan steps: one PR per worthwhile merge, named in the plan.

**Semantic duplicates** (same logic written differently): `jscpd --semantic` compares function embeddings with a local model it downloads once (548 MB). Run it from the weekly report, not CI.

## 10. CI gate

**A step per check, a job per file set.** Each check is its own named step, so a failure shows in the UI without digging through a combined log. Without a changes job (every check runs on every PR), fast whole-tree checks that share an install run as steps of one job, since each job pays for checkout and install (often a minute or more); a slow check or one with its own setup (build, e2e, mutation) gets its own job. With a changes job (below), the job is what gets skipped, what reports as a required check, and what gets rerun, so it's one job per file set: checks share a job only when their filters match the same files or one filter sits inside the other. The job's `if:` is the wider filter, and the narrower check's step carries its own. Checks with different filters get separate jobs, so each skips on its own and shows its own status. The `detectors` job below holds deadcode and dup because jscpd's filter sits inside knip's. Detectors join as they reach their gate. Deploys depend on the jobs (`needs:`).

- **Every step after the first needs `!cancelled()` in its `if:`,** even a step that already has a filter: `if: ${{ !cancelled() && needs.changes.outputs.dup == 'true' }}`. A custom `if:` without a status function gets an implicit `success() &&`, so one failed check silently skips the rest.
- **A check that needs another job's output** runs as a step of that job, not as a new job that checks out again and downloads the artifact: minutes of setup for a compare that takes a second.
- **Job names are the required-check names** in branch protection. Adding, renaming, or merging a job is a settings change outside the repo: list it in the PR description.

The worked example is GitHub Actions, matching the project's existing setup steps; CI in Adapting to the stack covers other providers:

```yaml
  detectors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      # the same package manager and Node setup and install steps the other jobs use
      - name: deadcode
        run: <run> deadcode
      - name: dup
        if: ${{ !cancelled() }} # still runs when the step above fails, so one run reports both
        run: <run> dup
```

**Fetch history for diff-based jobs:** `dup:new` and react-doctor on the diff need the full history and the PR's target branch as the base ref (GitHub Actions: `fetch-depth: 0` and `origin/${{ github.base_ref }}`).

**Match the repo's hardening:** copy what the other jobs do (on GitHub: pinned action SHAs, `permissions:` blocks, `persist-credentials: false`). Strings from the PR (file names, branch names, titles) are the PR author's input: they reach the shell through `env:`, never through `${{ … }}` inside `run:`.

**Path filters** (GitHub `on.pull_request.paths`, GitLab `rules: changes:`) save CI minutes, but they have traps:

- **List everything that changes the result:** the check's own config, any config it extends, `package.json` (the script's flags), the CI config itself, and any local plugin or rule file the tool loads (`scripts/lint-rules/`, a local stylelint plugin).
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
            const shared = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.nvmrc|\.github\/workflows\/ci\.yml)$/;
            const checks = {
              // a type-aware linter also reads imported JSON; add the framework's template extension
              lint: /\.([cm]?[jt]sx?|json)$/,
              // knip's plugins read the configs they know: anything outside the content folders
              detectors: /^(?!docs\/|public\/)/,
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
- **Filter on inputs, not on a list of trigger files.** For e2e, that's the directories the build and the specs read, the spec folder, and the configs. A hand-kept list of the files the specs cover drifts, and every new spec needs an entry. A rules-file line like "run e2e when touching X" is where to start reading, not the filter.

**Gate or report.** Before wiring a check script, decide which it is. A check that fails on a defect is a gate. A heuristic that exits 0 by design (a prose checker, where one hit is a word choice and five are a pattern) is a report: its own job, not a required check, and no `continue-on-error`, so a crash still fails it.

- **A report goes in a PR comment** by default, rather than the job summary: one comment per report, found by a marker and updated by later pushes. Copy `assets/scripts/pr-comment.mjs` and have every report job call it instead of an inline copy. It does the upsert and cuts the body under GitHub's 65,536-character limit, with a link to the job log. The job needs `pull-requests: write`.

**Add each gate in the step that gets its check to zero,** not before.

## react-doctor

Every React project gets it as a command. The plan's Variants say how far it goes:

- **Report:** the command and the scheduled full run (Running often), no cleanup steps and no gate. Findings get fixed in code a PR already touches. Only **Setup** and **Triage notes** below apply.
- **Gated:** three parts: set it up as a plain command, clean up the errors, then gate on them. All of this section applies.

**Setup** goes in with the other detectors, no gate yet, and by hand rather than with `react-doctor install`: that command writes an unversioned pre-commit block into `.git/hooks` and adds a `doctor` script without the release-age gate.

- **Don't install it.** Run it everywhere as `npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain`: the newest version at least a week old, so a hijacked release is usually pulled before it runs here. npx has no lockfile, so the gate matters even next to a pinned version. Without the flags it reports usage and sends the dependency list to Socket.dev; the team can drop them knowingly.
- **Check npm where it runs, CI included.** npm older than 11.10 warns that `--min-release-age` is unknown and then ignores it, so the gate is silently off. Run `npm --version` in a job and upgrade Node or npm there if needed.
- **Add a `react-doctor` script** with that command (not `doctor`: `pnpm doctor` is a built-in that shadows it). In a single-package repo add `--project .`, here and in the hook and CI commands, or it also scans nested projects in gitignored folders like worktrees.

**Errors are mandatory, and get cleaned up before any gate:** fix every one, in one step or several split by directory or rule. Gating first hands the backlog to whoever next touches a file with an old error. Before calling one a false positive, check whether cleanup happens another way (an array of observers disconnected together, say). Build-time `eval` or import-metadata findings in scripts are usually intentional: exclude those paths in config, with the reason.

**Triage notes:**

- **Suppressions go in react-doctor's config file** (`doctor.config.json` or `.jsonc`, or a `reactDoctor` key in `package.json`). A false positive gets a per-file entry under `ignore.overrides` (`{ "files": [...], "rules": [...] }`) with a comment saying why. `ignore.rules` drops a rule project-wide and `ignore.files` skips a file: keep those for documented patterns and whole path categories.
- **Hydration gates:** `react-doctor/no-initialize-state` and `react-doctor/rendering-hydration-no-flicker` misfire on the "set state after mount" pattern, like the effects plugin (section 3). Where the project documents it, suppress both in `ignore.rules`, with the reason.
- **`no-high-complexity-react-function`** counts only the component's own body, not nested callbacks, so extracting a `.map` callback changes nothing. Move a whole branch into a child component or a helper.
- **It reads the project's lint config,** so a lint config change can change its findings: add that config to the gate's path filter (section 10). If the config is type-aware, CI runs the framework's type generation before the scan.

**Gate once errors are zero,** in the hook and CI together, with `--blocking error`:

- **Hook, always scoped:** `--scope changed --base HEAD --include-untracked`, as in `assets/agent-check.sh`.
- **CI, a full scan when it fits the PR budget.** A scoped scan saves less than it seems, since startup takes a big share of either, and a full scan needs no git history and catches what a changed-files scope can't: a removed suppression, a changed lint config. Only when it doesn't fit, `--scope changed --base origin/<target branch>` with the full history fetched (section 10).
- `react-doctor ci install` generates a workflow that also comments findings on PRs; use it if the team wants the comments, and add the release-age gate and flags.

**Warnings report by default:** they don't block. Fix them in code a PR already touches; a rule with a real cluster of hits can become its own cleanup step. If the team wants warnings to block (the audit asks), they get the errors' path: a cleanup step, split by rule group if it gets long, then `--blocking warning`.

**Keep the scheduled full run after the gate.** `@latest` brings new rules with each release; without the scheduled run, a new rule first shows up as a block on some unrelated PR.

**`react-doctor design` is opt-in:** the UI design rules a full scan leaves out. It exits 0 even with `--blocking`, so a gate has to read the `diagnostics.json` it writes to `--output-dir`.

## Trim the rules file

The last step of the plan. A line that a check now enforces is a second copy of the rule: it competes for the model's attention, and the two drift apart when the config changes.

**Inventory what blocks.** A check enforces a rule only where it fails: a tsconfig flag, a lint rule at `error`, a warning the hooks deny on changed files, a boundary policy, a project rule in `scripts/lint-rules/`, knip or jscpd at their gate, react-doctor with `--blocking`, the agent hook, pre-commit, and the CI jobs that branch protection requires. A warning CI only prints isn't enforcement: its line stays until the rule is promoted.

**Read the required checks; don't trust the plan.** A job nobody added to branch protection fails red without blocking a merge. Compare the plan's gates with the settings (`gh api repos/{owner}/{repo}/rules/branches/<default>` for rulesets, `gh api repos/{owner}/{repo}/branches/<default>/protection` for classic protection), put any gap in the PR, and make the rules file's "blocks in CI" wording match what really blocks.

**At `error` doesn't prove a rule fires.** Plant a violation for every line you delete. Coverage that isn't: a type-aware JS-plugin rule under oxlint (section 3), a heuristic that matches names rather than types, a rule that never sees framework template files. Partial coverage means the line stays, or says where the check stops.

**Read every rules file** the probe lists (its `scars` section prints their prohibition lines, code-like ones first), plus the files they import. For each line that tells the model what to do or not do:

- **A check fails on exactly what the line forbids** ("never use `any`" with `no-explicit-any` at `error`, "run the tests before you finish" with the agent hook): delete the line. If it carried a reason, move the reason next to the code it explains: the rule's message, a comment in the config, or the header of the test that pins the contract.
- **A good/bad example pair whose bad half a check rejects:** delete only that half. The good half is still the convention.
- **A check covers the mechanical part and the line carries judgment** ("prefer `Map` over an index lookup that may miss" next to `noUncheckedIndexedAccess`): cut it to the judgment half.
- **The line claims a tool does something automatically** ("import order is auto-fixed"): delete it either way. If the claim is true, the model has nothing to do; if it's false, the line misleads. Check which, say so in the PR, and treat a false one whose convention still matters as a scar-rule candidate.
- **The line states a check's limit** ("the rule sees direct imports only, so new server-only code goes in `src/server/`"): keep it. It says what the check can't see.
- **"Run `<cmd>` when touching X":** the trigger list goes once a CI step runs the command on what it reads (section 10), since the list drifts. "Then fix or justify each hit" stays while that step doesn't block: nothing else makes anyone read a non-blocking result. If no plan step runs the command, add one to `todo.md` rather than wiring it here.
- **No check covers it:** keep it. If it's machine-checkable, add it to the plan's scar table rather than writing the rule in this step.

**After deleting, grep the other rules files** for pointers to what's gone ("AGENTS.md lists the triggers").

The rollout's own Conventions section gets the same test: its "no new `!`, `as any`" clause goes once those rules are errors, and its first line, which points at `anti-slop/`, goes. "Fix, don't silence", the lines about suggesting a check after each bug and running mutation after writing tests, and the commands list stay: no check sees those.

**Keep** what no check sees: product context, architecture, where things live, how to run the app, review conventions. The step makes the file shorter, not emptier.

**Then delete `anti-slop/`.** Git keeps the plan's history. An open step PR hits a modify/delete conflict on `plan.md` and `todo.md`: don't hold the trim for it. Both PR descriptions say to keep the deletion, and the open PR deletes its own rules-file line itself.
