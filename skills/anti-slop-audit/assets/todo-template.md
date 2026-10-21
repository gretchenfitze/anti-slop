# Anti-slop TODO: <project>

The rollout steps of [plan.md](plan.md), one PR each, in order. The anti-slop-rollout skill takes the first unchecked one. The numbers, the reasoning, and the history are in the plan.

New rules start as warnings that only changed files must pass, get promoted one at a time, and CI gates come last. The rollout ends with no rule at `warn`.

- [ ] **1. <Title>**: <one-sentence goal>.
  - Changes: <packages, files, config keys, scripts>
  - Commands: <what the step adds, e.g. `pnpm deadcode`>
  - Done when: <a checkable condition, e.g. "knip reports 0 issues; CI job `deadcode` green">
  - Depends on: <earlier step, or none>
- [ ] **2. <Title>**: …
- [ ] **<N>. Clear the rest of <preset> and promote it**: every rule of the set becomes an error.
  - Changes: fix the <N at audit> hits the earlier cleanup steps left, then move every listed rule to `error`, including those already at zero and `cognitive-complexity` (<N at audit> functions to split). <A rule that can't reach zero here: the follow-up step that promotes it.>
  - Commands: none
  - Done when: lint prints no warnings, and a planted hit of a promoted rule fails it
  - Depends on: the preset's earlier cleanup steps
- [ ] **<last>. Trim the agent rules file**: delete every rule a check now enforces, so the file only says what no check can. Then delete `anti-slop/`.
  - Changes: AGENTS.md (or CLAUDE.md, and the other agents' rules files); `anti-slop/` removed
  - Commands: none
  - Done when: no line restates a check that blocks; the PR lists each deleted line next to the check that replaced it; `anti-slop/` is gone
  - Depends on: the last step that adds or promotes a check
