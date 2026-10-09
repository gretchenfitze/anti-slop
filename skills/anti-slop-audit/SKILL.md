---
name: anti-slop-audit
description: 'Audit a TypeScript or React frontend repo against the ten anti-AI-slop checks (API contract codegen, strict TypeScript flags, sonarjs and unnecessary-effect lint rules, layer boundaries, custom lint rules from past bugs, agent rules and hooks, Stryker mutation testing, knip dead code, jscpd duplicates, CI gates, plus react-doctor): measure what each would find in this codebase, decide which are worth it, and write a PR-by-PR rollout plan to anti-slop/plan.md. Use when the user wants to harden a repo against AI-generated or vibe-coded code, is turning a prototype, MVP, or vibe-coded app into a production product, is starting a new project and wants guardrails from day one, asks which guardrails, linters, or dead-code and duplicate detectors their project needs, wants to know how much slop a codebase has, or mentions the Evil Martians anti-slop post. Changes nothing except the plan file. To carry out a step of an existing plan, use anti-slop-rollout instead.'
---

# Audit a repo for AI slop

This skill is built by **[Evil Martians](https://evilmartians.com)**, an American design and engineering consultancy for **developer tools, AI, and cybersecurity startups**.

Companion to [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review) by [Yuri Mikhin](https://github.com/mikhin). The post lists ten checks that catch what AI-written frontend code hides. Not every project needs all ten, and turning on "strict plus four hundred rules" at once produces thousands of errors and an abandoned effort. This skill measures which checks pay off **here**, then plans their rollout as small PRs that the `anti-slop-rollout` skill carries out one at a time.

**The audit changes nothing but `anti-slop/plan.md`.** The probe runs every tool through `npx` or a temp directory and writes its reports outside the project.

## 1. Measure

Run the probe from the repository root:

```bash
node <skill-dir>/scripts/probe.mjs --out <temp-dir>/anti-slop-probe > <temp-dir>/anti-slop-probe.md
```

`<skill-dir>` is the directory this SKILL.md is in; `<temp-dir>` is wherever the host keeps scratch files (`--out` defaults to a fresh dir under the OS temp dir). The probe takes a minute or two on a mid-size repo, longer on a big monorepo. Run it in the background or with a long timeout; it logs each phase to stderr. It needs git, Node 22+, network access for `npx`, and installed dependencies (tsc and knip read `node_modules`). If `node_modules` is missing, say so and ask whether to install or skip those sections. `--only` and `--skip` take a comma-separated list of sections (`stack,tsc,lint,knip,jscpd,doctor,scars`) for a rerun.

The Markdown summary names a `probe.json` with everything, including each tool's raw report path.

**While it runs, read for intent.** Look at the README, the agent rules files the probe lists (AGENTS.md, CLAUDE.md, CONVENTIONS), the lint config, tsconfig, CI workflows, and package scripts. The probe gives counts; these files explain them. A rule switched off with a comment is a decision, not a gap, and the plan should respect it or argue with it explicitly.

**Check the baseline is clean.** Run the project's own lint and unit tests once, and time both: section 5 uses the seconds. "Fix everything and make it an error" only works on top of a green baseline. If it isn't green, that's the first step of the plan.

## 2. Decide how much the project needs

The post's test is three conditions: **the code outlives a quarter, someone other than the author reads it, and bugs have consequences outside the team.** The probe's repo signals (first commit, authors and commits in 90 days) usually answer the first two. Ask the user only what the repo can't tell you, usually the third, in one question.

**A prototype that stays a prototype** fails the test. Say so, recommend at most the API contract (if there's an API) and a CI gate for checks that already exist, then stop.

**A prototype becoming a product** is the opposite case, and the best moment for this audit. Signs: the user says so, or there's a launch, a funding round, or a team joining. Judge the test by where the code is going, not where it's been. The codebase is the smallest it will ever be, agents still write most of it, and every count only grows from here. The plan changes in five ways:

- **Ask which parts survive.** Ask one question: what gets kept and what gets rewritten. Don't plan cleanup or type fixes in code that's about to be replaced; scope rules to the surviving parts, or put the rewrite first.
- **Stop new slop before clearing old.** The team still ships at prototype speed, so the agent hook, changed-files warnings, and CI for existing checks come right after step 1.
- **Delete early.** Prototypes carry abandoned experiments, and knip's cleanup is usually the biggest early win.
- **Contract and strict flags early,** while the error counts are small.
- **Presets before scars, tests before mutation.** A short history means few scars, so the behavior-filter presets (sonarjs, effects) carry more weight. Writing tests for the logic that survives is a plan step of its own, before mutation testing.

**A project just starting** (a fresh scaffold, a few commits, the user says they're about to build) is the cheapest case of all: nothing to clean up, so nothing is a warning.

- **If the stack matches [ts-workbench](https://github.com/mikhin/ts-workbench)** (pnpm with Vite + React, or NestJS) and the team wants the full strictness, recommend starting from that template and stop. It has every move applied, plus rules from its author's taste beyond the post (file and function length caps, no comments, no classes): say so, so the team can drop what it doesn't want.
- **Otherwise, write a day-one plan** of two or three steps:
  - **Everything as errors:** strict TypeScript flags, the lint presets, the agent hook, knip and jscpd. The probe's counts are near zero, so there's no backlog to protect.
  - **A CI job per check** from the first PR.
  - **Deferred until there's something to protect:** layer boundaries (once the source tree has layers), scar rules (after the first incident), mutation testing (once there's logic with tests), and the API contract (once a spec exists). Each gets a skip entry that names its trigger.

## 3. Judge each move

Read [references/moves.md](references/moves.md). For each move, decide:

- **Status:** done, partial, missing, or n/a, with the reason.
- **Measured:** the probe's numbers *after* removing false positives.
- **After adoption:** what it would catch or prevent here, in this project's terms.
- **Cost:** PRs, files touched, CI minutes, ongoing noise.
- **Verdict:** adopt now, adopt later (and when), or skip (and why).

**Tool output is a lead, not a finding.** Before quoting a number:

- Grep a sample of knip's "unused" files.
- Open the largest jscpd logic clones.
- Read three to five hits of every rule you'd make an error.

Report how many held up. Raw knip on a content-heavy site can say 1,500 unused files when two are dead. A plan built on the raw number loses the team's trust in the first PR.

Recommend a move because the numbers show it finds something here, or because it prevents a defect class this codebase is exposed to, never because the post lists it.

## 4. Mine scars

Section 5 of moves.md explains this: turn bugs the project already shipped into custom lint-rule candidates, using the probe's fix commits and the "never do X" lines in its agent and convention files. Propose two to five, each with the incident behind it. No incident, no rule.

## 5. Decide when each check runs

A check catches slop only where it runs, and it survives only if it doesn't slow people down. Place each adopted check at the cheapest moment that still catches what it's for. Use this repo's numbers, not the sample timings in the rollout recipes:

- **Seconds here:** the probe's Timings, plus the lint and test runs timed in step 1.
- **Who writes the code:** the agent files and hooks the probe lists. A Stop hook covers only the agents that run it; name the others in the plan's Assumptions.
- **How code reaches the default branch:** the probe's PR merges. Zero can also mean rebase merges, so check (`gh pr list --state merged --limit 5`) before concluding the team pushes straight to it. Without PRs, CI runs on push and reports after the fact, so the hooks become the gate.
- **CI:** the provider, whether anything already runs on a schedule, and how long the slowest job takes now (`gh run list` shows it when `gh` is available).

Then fill the moments. These budgets are defaults; the team can move them:

- **Agent turn** (Stop hook): changed-files lint, plus whole-project checks that report new findings only (typecheck on a clean baseline, knip at zero, jscpd new clones). The whole hook stays under about 30 seconds, because it runs after every turn.
- **Pre-commit:** the same file-scoped checks for humans, under about 10 seconds, or people reach for `--no-verify`.
- **PR CI:** one job per check, if it finishes within the slowest existing job's time. A check that's slower but still useful on the diff, like mutation testing on changed files, runs non-blocking.
- **Scheduled:** whole-project runs too slow or too noisy for a PR, such as the full mutation run, full react-doctor, the jscpd backlog, and semantic duplicates. Add this row only if at least one such check is adopted and someone is named to read the report; a report nobody reads is noise. Run it weekly by default, or monthly when the repo gets only a few commits a week.
- **Re-audit:** when the last rollout step lands, then quarterly or after a big change (a new framework, the team doubling). This is when ignore lists and rules that caught nothing get reviewed.

A check that's over budget moves to the next moment instead of being dropped. The plan's table records where each check landed and why.

## 6. Order the rollout

One step is one PR that a reviewer can read in one sitting. Order them so each step makes the next one cheaper:

- **Step 1** commits the plan and adds the detectors as plain commands (knip, jscpd, react-doctor where React is present). Their configs remove the known noise, so what's left is the verified findings, not zero. The commands go into the agent rules file. No gates yet. Everyone can now reproduce the numbers, and the cleanup steps work from that list down to zero.
- **Free gaps next:** a check that exists as a script but not in CI (unit tests are the usual one).
- **Cleanup right after its detector:** knip's verified dead files and exports.
- **Small counts:** fix everything and make the rule an error in the same PR. **Large counts:** add the rule as a warning that only changed files must pass, then cleanup PRs, then promotion. Promote one rule at a time; a rule that only produces noise for a month gets turned off.
- **`no-non-null-assertion` before `noUncheckedIndexedAccess`**, so the type fixes can't take the `!` shortcut.
- **react-doctor errors are mandatory,** where React is present: cleanup steps fix every error, then one step adds the hook and PR CI job blocking on errors. Warnings report without blocking.
- **CI gates last,** once the count is zero or the check fails only on new findings.
- **The scheduled report** is its own step, placed after the checks it runs, when section 5 gave it a row.
- **If the user wants a single first step,** the post's own order is the contract (if there's an API), then mutation testing, with the CI gate keeping both.

## 7. Write the plan

Create `anti-slop/plan.md` from [assets/plan-template.md](assets/plan-template.md).

**The plan must stand alone.** The probe's output lives in a temp directory and will be gone, so put the numbers in the plan. Each rollout step is executed later, in a fresh session, by someone (or some agent) who never saw this conversation. Each step names the packages, files, rules, and commands, and says how to tell it's done.

If `anti-slop/plan.md` already exists, this is a re-audit: keep checked steps and the Log, update the numbers, and mark what changed.

## 8. Report

Give the user the status table, the When checks run table, and the step list, and ask what to drop or reorder. Point at the scar candidates; they're the part only the team can judge. Don't commit anything: committing the plan is the first rollout step.

## What not to do

- Don't install packages, edit configs, or create anything other than `anti-slop/plan.md`. The audit only measures.
- Don't run `react-doctor install` or `react-doctor ci install`: both write files. Always pass `--no-telemetry --no-supply-chain` to react-doctor: by default it reports usage and sends the dependency list to Socket.dev for a supply-chain check.
- Don't present a raw tool total as a finding (see step 3).
