---
name: anti-slop-rollout
description: 'Carry out the next step of an anti-AI-slop rollout plan (anti-slop/plan.md) as one pull request: add a single check (a strict TypeScript flag, sonarjs or unnecessary-effect or Playwright lint rules, layer boundaries, a custom lint rule from a past bug, an agent Stop hook, Stryker mutation testing, knip and dead-file scripts, jscpd, react-doctor, a CI gate, or a scheduled report), fix or baseline what it finds, document its commands in the agent rules file, verify it, and open the PR. Use when the user says "next anti-slop step", "do step N of the plan", or asks to set up knip, jscpd, react-doctor, Stryker, sonarjs, or boundaries the gradual way (warnings first, CI gate last) in a repo that has an anti-slop plan. Needs the plan from anti-slop-audit; without one, run the audit first.'
---

# Roll out one anti-slop step

This skill is built by **[Evil Martians](https://evilmartians.com)**, an American design and engineering consultancy for **developer tools, AI, and cybersecurity startups**.

Companion to [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review) by [Yuri Mikhin](https://github.com/mikhin). The `anti-slop-audit` skill wrote a plan of small PRs to `anti-slop/plan.md`; this skill carries out **one step per run**.

One step is one PR because each one needs a human review. These checks exist to cut how much code people have to read, not to skip reading. Don't continue into the next step unless the user asks.

## 1. Load the plan

Read `anti-slop/plan.md`. If it doesn't exist, say so and offer to run `anti-slop-audit` first.

Take the step the user named, or else the first unchecked one. Check its "Depends on": if an earlier step's PR isn't merged yet, say so. Ask whether to wait or to branch from that PR.

## 2. Measure again

The plan's numbers are from the audit, and the code has moved since. Rerun the relevant probe section from the sibling skill:

```bash
node <skill-dir>/../anti-slop-audit/scripts/probe.mjs --only <sections, comma-separated: tsc,lint,knip,jscpd,doctor>
```

`<skill-dir>` is the directory this SKILL.md is in. If the audit skill isn't installed next to it, run the tool from the recipe directly. Note the numbers: they go into the PR description and the plan's Log.

## 3. Branch

Start from the default branch, up to date (fetch first; if the network is down, branch from the local copy and say so in the report). Name the branch the way the project does (check AGENTS.md, CONTRIBUTING, recent branches), or `chore/anti-slop-<step-slug>` if nothing says.

If the working tree has uncommitted changes, they're the user's. Don't stash them or sweep them into the branch. Ask, or work in a `git worktree`. The one exception is an uncommitted `anti-slop/plan.md` fresh from the audit: committing it is step 1's job, so carry it onto the branch.

## 4. Implement

Read [references/recipes.md](references/recipes.md): **Adapting to the stack**, **Conventions**, **Running often**, and the section for this step only. Wire the check at the moments the plan's **When checks run** table gives it: agent hook, pre-commit, CI, or the scheduled report.

`assets/` holds files to copy into the project. They're templates: adapt them to the project's aliases, globs, tools, and naming, and drop the parts that don't apply.

- `assets/scripts/` holds the detector scripts. They go flat into `anti-slop/`, because they resolve the repo root as their parent directory.
- `assets/lint-rules/` holds the project-rule template. It goes to `anti-slop/lint-rules/`.
- `assets/agent-check.sh` is the Stop hook. It goes to `anti-slop/agent-check.sh`.

Add packages with the project's package manager as devDependencies, at current versions. The plan step names them, and asking for the step is asking for them. If the project's rules require approval for new dependencies anyway, list them and confirm before adding.

**The plan and the recipe can disagree** on a mechanical detail (a file name, a script name, where commands go). The recipe wins unless the plan says why it differs. Note the deviation in the plan's Log.

**Follow the post's rollout discipline:**

- **Count decides the rule level.** A new rule starts as a warning, unless its count is small enough to fix in this PR; then fix everything and make it an error.
- **Fix findings properly.** No new `!`, `as any`, disable comments, or reason-less ignore entries to get a check green. A false positive gets a config-level ignore with a comment saying why. If a suppression is truly needed, it carries the reason.
- **One concern per PR.** If the fixes balloon (dozens of files, or risky logic), land the config with warnings now, and insert cleanup steps into the plan for later PRs.
- **Scores are diagnostics.** Never change code to move a react-doctor or mutation score.

## 5. Document

Add the **Conventions** section from recipes.md to the project's agent rules file the first time; later steps only add their commands to its list. Use AGENTS.md if the project has it, otherwise CLAUDE.md. Match the file's style and keep additions short.

## 6. Verify

- **New commands:** run each one and compare the result with the step's "Done when". Check that the output really comes from the tool: a script name that collides with a package manager built-in runs the built-in and exits 0.
- **Detectors:** prove each one finds something. Plant a dead file, a stale mock, or a duplicated block, see it reported, then remove the plant. For react-doctor, plant an effect that adds a listener without cleanup.
- **Project lint rules:** the fixture test passes, and the rule fires on the code from before the incident's fix (`git show <sha>^:<file>`).
- **The project's existing checks:** run the ones the change can affect (lint, typecheck, unit tests, build). If something fails that you can't fix within this step, report it with the output. Don't hide it.

## 7. Update the plan

Check the step off. Append to the Log: date, step, branch or PR, numbers before → after, and anything that changed the plan (a rule turned off as noise, a threshold moved, follow-up steps inserted).

## 8. Commit and open the PR

Commit in the project's message style (short and imperative if nothing says otherwise). Push, and open the PR with `gh pr create` (or the forge's CLI or API).

**The PR description says:**

- what the check catches (one sentence of the reasoning from the post)
- the numbers before → after
- what's deferred to later steps
- how to run the check locally

Link the plan step (in local mode, its path and heading: `anti-slop/plan.md`, step N).

**Local mode:** if the user asked not to push or open PRs (testing, offline, reviewing first), stop after the commit. Print the PR title and description so they can open it later.

Then report the branch, the PR link (or "local only"), the numbers, and the next step in the plan.
