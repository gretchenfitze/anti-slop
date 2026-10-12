# Anti-slop TODO: <project>

The rollout steps of [plan.md](plan.md), one PR each, in order. The anti-slop-rollout skill takes the first unchecked one. The numbers, the reasoning, and the history are in the plan.

New rules start as warnings that only changed files must pass, get promoted one at a time, and CI gates come last.

- [ ] **1. <Title>**: <one-sentence goal>.
  - Changes: <packages, files, config keys, scripts>
  - Commands: <what the step adds, e.g. `pnpm deadcode`>
  - Done when: <a checkable condition, e.g. "knip reports 0 issues; CI job `deadcode` green">
  - Depends on: <earlier step, or none>
- [ ] **2. <Title>**: …
