# The moves, and how to judge each one

The moves come from [Yuri Mikhin](https://github.com/mikhin)'s [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review); "the post" below means that article.

One section per move. Each says what it catches, when it fits, what "done" looks like, how to read the probe's numbers, and what it costs. Moves 1–6 keep extra code from being written, 7–9 find what's already there, 10 makes the rest mandatory. react-doctor is listed last: it isn't one of the post's ten, but every React project should run it in review.

Statuses for the plan: **done** (in place and enforced), **partial** (in place but not enforced, or only some of it), **missing**, **n/a** (doesn't fit this project, with the reason).

Contents: [1 Contract](#1-api-contract) · [2 Strict TS](#2-strict-typescript) · [3 Linter as filter](#3-linter-as-a-behavior-filter) · [4 Boundaries](#4-layer-boundaries) · [5 Scar rules](#5-scar-rules) · [6 Rules in front of the model](#6-rules-in-front-of-the-model) · [7 Mutation testing](#7-mutation-testing) · [8 Dead code](#8-dead-code) · [9 Duplicates](#9-duplicates) · [10 CI gate](#10-ci-gate) · [react-doctor](#react-doctor)

## 1. API contract

**Catches** fields that don't exist (`user.fullName` when the API sends `firstName`): the most recognizable AI defect in frontend code.

**Fits when** the frontend talks to an HTTP API with a spec (OpenAPI) that the backend keeps current, or one could exist. GraphQL with codegen and tRPC already give the same guarantee: mark those **done**.

**Skip when** there's no API the team controls or no spec coming (a static site, a pure third-party SDK consumer). Say so: the post itself says to skip to the next move.

**Probe:** `stack.api.specs`, `stack.api.tooling`, `signals.fetchCalls`/`axiosCalls`. Hand-written `fetch` calls plus a spec but no generator = **missing** with high value. A generator but hand-written types next to it = **partial**.

**Done looks like:** types, client, and Zod schemas generated from the spec (Hey API), the generated folder excluded from review and lint, and a CI step that regenerates and fails on a diff.

**Cost:** one PR to wire the generator, then a migration of call sites that can be split by feature.

## 2. Strict TypeScript

**Catches** confident assumptions: `arr[0]` treated as defined, optional props treated as present.

**Fits** every TypeScript project.

**Probe:** `tsc.enabled`, `tsc.flags.*.newErrors`, `tsc.flags.*.byDir`. Read the counts this way:

- **`strict` off:** that's the first PR, before anything else in this move. TypeScript 6 turns it on by default, so a config without it is strict unless it sets `"strict": false`.
- **Near-zero counts** (a fresh project): turn every flag on in one PR. That never gets cheaper.
- **`noUncheckedIndexedAccess`:** usually worth it. Under ~150 new errors is one PR; above that, one PR per top directory.
- **`exactOptionalPropertyTypes`:** noisier with React props and framework types. Recommend it only when the count is small or the codebase is mostly domain logic; otherwise **skip for now** and say why.
- **Framework files:** the probe's `note` says when tsc can't see `.astro`/`.vue`/`.svelte` files. The real count is higher, and the framework's checker (`astro check`, `vue-tsc`, `svelte-check`) must also pass.

**Ordering trap:** fixing `noUncheckedIndexedAccess` errors tempts an agent to paste `!` everywhere. Put the `no-non-null-assertion` lint rule (move 3) in an earlier PR so that shortcut fails.

## 3. Linter as a behavior filter

A preset someone else wrote goes in as a batch; it needs no incident behind it. The probe runs every candidate rule as a warning through oxlint, whatever linter the project uses, so the counts are comparable across projects.

| Rule set | What it catches | Probe field | How to judge |
|---|---|---|---|
| sonarjs (recommended) | cognitive complexity, identical branches, nested conditionals, duplicated literals, risky regexes | `lint.sonarjs` | The heavy lifter. Look past the total: `cognitive-complexity`, `no-nested-conditional`, `no-identical-functions`, `super-linear-regex` are signal; `os-command-from-path`, `pseudo-random`, `no-hardcoded-ip` in build scripts are usually noise and get turned off for those paths. |
| react-you-might-not-need-an-effect | effects used for derived state, prop sync, event handling: the most frequent AI edit in React | `lint.effects` | Compare with `signals.useEffect`. SSR/islands frameworks (Astro, Next) have legitimate "set state after mount" effects to avoid hydration mismatches. If the project disables `react/set-state-in-effect` or documents a hydration pattern, expect `no-initialize-state` hits to be partly intentional: triage a sample before recommending it as an error. |
| vitest/jest `expect-expect`, `no-focused-tests` | tests with no assertion, forgotten `.only` | `lint.tests` | Cheap, near-zero noise. |
| eslint-plugin-playwright | conditionals in tests, missing `await` on assertions, `.only`, fixed timeouts | `lint.playwright` | Cheap if e2e exists. |
| jsx-a11y | what a screenshot can't show | `lint.jsxA11y` | Often already on. |
| `no-explicit-any` | escape hatches | `lint.native` | Error if the count is small; a warning with a burn-down if large. |
| `no-non-null-assertion` | "trust me, it's not null" | `lint.native` | Usually small; make it an error early (see move 2). |
| `consistent-type-definitions` | `type`/`interface` flip-flopping | `lint.native` | Style; autofixable in ESLint; cheap. |
| `explicit-module-boundary-types` | inferred return types on exports | `lint.native` | Often hundreds of hits. Recommend only when the count is manageable; otherwise skip and say why. |
| filename matches export, imports through aliases | makes dead-code tools trustworthy | read the tree | Only where the project already uses aliases. Don't impose aliases on a relative-import codebase just for this. |

**How "warnings that only changed files must pass" works**, so plans say it the same way every time: the hooks that lint changed files (pre-commit and the agent hook) treat warnings as errors (`oxlint --deny-warnings`, `eslint --max-warnings=0`, `stylelint --max-warnings 0`). CI's full run prints warnings without failing. Promotion to error is what makes CI enforce a rule everywhere.

**oxlint can't extend an ESLint plugin's preset.** Adopting "sonarjs recommended" through `jsPlugins` means listing the rules. The probe's generated config (`lint.config` in probe.json) already has the list.

**Template files:** oxlint reads only the script part of `.astro`/`.vue`/`.svelte`, so anything used only in the template looks unused. The probe already turns off `sonarjs/unused-import` there. If other rules cluster on template files, suspect the same cause before counting them.

## 4. Layer boundaries

**Catches** architectural drift toward "the GitHub average": a service importing a component, a design system that knows about the API, mocks in production code.

**Fits when** the source tree has recognizable layers (`stack.topLevelSourceDirs`) and the project is past prototype stage.

**Probe:** `stack.boundaryTooling`, `lint.native['import/no-cycle']`, `stack.topLevelSourceDirs`, and any layer rules stated in the agent/convention files.

**Recommend a small set**, 3–5 rules, each traceable to the project's own docs or incidents. The usual ones: one-way dependencies (UI → services, never back); utilities/types/config free of domain code; design system isolated from state and API; mocks out of production; routes map to pages and nothing else. A server-only module (Node APIs, secrets) reachable from client code is a strong candidate wherever the framework mixes server and client code. Every rule's message says where the import should go instead.

**Cost:** the config PR, plus fixing existing violations and import cycles.

## 5. Scar rules

**What a scar is:** a bug the project already shipped, encoded as a lint rule so it can't ship again. The post's example: a service rounded hours, the formatter rounded again, and 26h15m showed as 26h18m. The rule bans `Math.round`/`toFixed` in what services return, and its message tells that story. The second kind of custom rule is a **behavior filter**: it cancels a default the model brings from a million other repos when the common way is wrong in this codebase.

**The test:** if you can't name the incident behind a rule, don't propose it.

**How to mine candidates** from the probe's `scars` section:

1. **Fix and revert commits:** for each plausible one, read the diff (`git show <sha> --stat`, then the relevant hunk). Keep it only if the mistake is visible in syntax: a call, an import, a property, a pattern a linter can match. "Fix typo" or "fix layout on Safari" via CSS values usually isn't.
2. **Prohibition lines** in AGENTS.md, CLAUDE.md, CONVENTIONS, or Cursor rules ("never X", "don't Y", "use A instead of B"). Each one that's machine-checkable is prose doing a linter's job. The post's point: a rules file is read once per session and loses to a million repositories in the weights.
3. **Repeated review comments**, if the user can point you to them.

**Replay the incident.** Run the proposed rule against the file as it was before the fix (`git show <sha>^:<path> > /tmp/x.ts`, then lint it with the rule in a scratch config). A rule that fires on the original bug and is quiet on today's code is the strongest case a plan can make.

**For each candidate, record:** the incident (commit sha or doc line), what the rule matches, the message (what failed, why, what to do instead), and whether it belongs to the linter (JS/TS) or the style linter (CSS). Propose 2–5, best first. The plan lists them; the rollout PR implements the ones the user keeps.

## 6. Rules in front of the model

**Catches** nothing by itself. It lowers the frequency of mistakes while the agent works. Prevention is probabilistic, so this never replaces a check.

**Done looks like:**

- **An agent rules file** (AGENTS.md or CLAUDE.md) listing the check commands and the project's conventions.
- **An agent hook** that runs the linter on changed files when the agent stops (Claude Code `Stop` hook exiting 2 so the agent must fix what it broke), plus a pre-commit hook for humans.

**Probe:** `stack.agentFiles`, `stack.agentHooks`, `stack.gitHooks`. A rules file without a hook is **partial**: the hook is what turns the rules from advice into a feedback loop.

## 7. Mutation testing

**Catches** tests that run code without checking it: shape instead of content, unverified snapshots, assertions that repeat the implementation, tests of the mock.

**Fits when** there's a unit-test suite worth trusting (`repo.testFiles`), a Stryker runner for it (`mutation.strykerRunnerAvailable`: Vitest, Jest, Mocha, Jasmine, Karma), and pure logic worth mutating.

**Without a dedicated runner** (`node:test`, Bun), Stryker's command runner reruns the whole suite once per mutant, with no per-test coverage. The cost is roughly mutants × suite time. A sub-second suite over a narrow `mutate` scope (one pure-logic module) stays affordable as a local or weekly run; a slow suite doesn't.

**Skip or defer when** there are only a handful of tests and no pure logic worth protecting. Say what would change the verdict ("revisit when the suite moves to Vitest or passes N files").

**Rollout notes for the plan:** incremental mode; on PRs mutate only changed files; report surviving mutants as a PR comment; **no failure threshold**. The score is a detector, not a KPI.

## 8. Dead code

**Catches** unused files, exports, and dependencies: AI adds far more readily than it deletes.

**Probe:** `knip.*`. Read it carefully before quoting it:

- **Without a project knip config,** knip uses defaults. Content folders loaded by glob (Markdown/MDX collections, CMS fixtures), framework entry points it doesn't know, and scripts run by path all show up as unused. The probe splits unused files into non-code (almost always false positives) and code.
- **Verify code files before calling them dead:** grep for the file's basename and its export names. Check each "unused dependency" for string references in config files (`astro.config.*`, `vite.config.*`, `next.config.*`, `babel`/`postcss` configs) and in scripts outside `src/`.
- **Report three numbers:** what raw knip says, what's verifiably dead, and what needs config (entries, ignores) to stop being noise. The plan's config is `knip.jsonc`, so every entry and ignore can carry its reason.

**The probe sorts knip's unused exports** by what a grep finds:
- `testsOnly`: fix the test entries, not the code.
- `fileLocal`: drop the `export`.
- `noReferences`: likely dead.
- `nameElsewhere`: the name appears in another file, maybe as a different symbol; read it.
- `default`: usually a duplicate of a named export.

**Custom detectors are optional,** for gaps knip leaves in this project:
- **A reachability walk from entry points** pays off when knip can't see the real graph: unusual aliases, a generated client, design-system conventions, files loaded by glob. With correct entries, knip's unused-files list already is reachability.
- **The `vi.mock()` drift check** applies only when `signals.viMock` > 0.

Recommend each only with the reason it applies here. Each one the plan keeps needs a test that proves it finds a planted dead file or mock.

## 9. Duplicates

**Catches** second implementations: writing a new helper is cheaper for a model than finding the old one, and the copies drift (the post's payroll total showed 23h30m in one place and 0h00m in another).

**Probe:** `jscpd.logic` (ts/js), `jscpd.components` (tsx/jsx), `jscpd.styles` (css/scss). Judge them separately: repeated JSX and CSS can be intentional, repeated business logic is a maintenance risk. In React code, hooks and handlers live in `.tsx`, so read the largest component clones for logic too. Name the two or three clones worth merging.

**Done looks like:** logic and markup checked as separate jscpd runs, with stricter minimums for logic. The gate fails on *new* clones only (`--baseline-from-ref <base> --fail-on-new-clones`, jscpd 5.4+), so the existing backlog doesn't block anyone. A triage script that groups clones by fragment helps only with a big backlog (dozens of logic clones or more).

**Limit:** plain jscpd finds textual similarity only, and two independent implementations of one rule look different. jscpd 5.4 adds `--similarity` (near-miss functions by AST) and an experimental `--semantic` mode that compares function embeddings with a local 548 MB model. Offer semantic as an occasional report, not a gate, and say it needs a one-time model download.

## 10. CI gate

**A check is mandatory only when CI blocks the branch.** One job per check (format+lint, typecheck, unit tests, mutation on the PR diff, build), deploys depend on them.

**Probe:** `stack.ci.checks` against the project's scripts. A check that exists as a script but not in CI (unit tests are the usual one) is a cheap, high-value gap: put it early in the plan.

**Gates on new checks come last:** a rule or detector gets its CI gate only after its count reaches zero, or after it has a ratchet baseline. Otherwise people work around the check instead of fixing what it finds.

## react-doctor

**What it is:** React-specific analysis (effects, state, hydration, performance, security) with a score. It scans the whole project or only changed files (`--scope changed --base <ref>`), and its errors are mostly real bugs: missing effect cleanup, leaked observers, unsafe patterns.

**Recommend it for every React project** as part of the review flow: a PR CI job that blocks on errors, plus the agent hook. Its severity split sets the rollout:

- **Errors are mandatory, cleanup first.** The plan fixes all of them, then gates the hook and CI with `--blocking error`. Gating earlier hands the backlog to whoever next touches a file with an old error. Before calling one a false positive, check whether cleanup happens another way (an array of observers disconnected together, say). A real false positive gets a config-level ignore with the reason.
- **Warnings are recommended, not mandatory.** They're reported but don't block. Fix them in code you're already touching. A rule with a real cluster of hits can become a cleanup step.

**Probe:** `doctor.*`. `bySeverity.error` sizes the cleanup, so list the errors in the plan. Findings in build-time scripts (eval, import metadata) are usually intentional: exclude those paths rather than count them.

**Setup:** add it as a pinned devDependency and call it from a package script, the agent hook, and CI. Don't use `react-doctor install`, which writes straight into `.git/hooks` and adds an unpinned `doctor` script. The rollout recipe has the commands.

**Notes for the plan:** run it with `--no-telemetry --no-supply-chain`. By default it reports usage, and its supply-chain scan sends the dependency list to Socket.dev. Name the package script `react-doctor`, not `doctor`: `pnpm doctor` is a pnpm built-in that runs instead and reports success. Its license is a modified MIT that forbids using it as AI training data or reselling it as a hosted service, which is fine for running it in a project. Its score is a diagnostic, not a target, just like the mutation score.
