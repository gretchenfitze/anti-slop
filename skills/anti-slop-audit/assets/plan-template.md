# Anti-slop plan: <project>

Audited <YYYY-MM-DD> with the anti-slop-audit skill, based on [Yuri Mikhin](https://github.com/mikhin)'s [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review). The numbers below come from that run. Each rollout step measures again before it starts.

## Fit

<Two to four sentences. How long the code will live, who reads it, what a bug costs, and so how much of this the project needs.>

## Assumptions

<Anything the audit couldn't confirm from the repo and nobody was around to answer: branch protection, a rule disabled on purpose, whether a hook runs for every agent. One line each, so the team can correct them before step 1.>

## Where the project stands

One line per cell: the headline number and the verdict. Details go in the notes below.

| # | Move | Status | Measured | Verdict |
|---|---|---|---|---|
| 1 | API contract | | | |
| 2 | Strict TypeScript | | | |
| 3 | Linter as a behavior filter | | | |
| 4 | Layer boundaries | | | |
| 5 | Scar rules | | | |
| 6 | Rules in front of the model | | | |
| 7 | Mutation testing | | | |
| 8 | Dead code | | | |
| 9 | Duplicates | | | |
| 10 | CI gate | | | |
| + | react-doctor | | | |

<Then a short section per move that needs one: what adopting it would catch here, what it costs, which false positives were removed and how, what was verified by hand, and what would change a skip.>

## When checks run

Seconds are from the audit run. Each rollout step wires its check where this table puts it, times it again with the installed tool, and moves it to the next moment if it's now over budget.

| Moment | Budget | Checks (seconds here) |
|---|---|---|
| Agent turn: Stop hook (<agents covered>) | ~30 s total | |
| Pre-commit | ~10 s | |
| <PR CI, or push CI and why> | <slowest existing job> | |
| Scheduled: <weekly or monthly>, read by <who> | none | <or "none: why"> |
| Re-audit | | <when> |

## Scar rule candidates

| Incident | What the rule matches | Message (what failed, why, what instead) |
|---|---|---|
| <commit sha or doc line> | | |

## Rollout

Each step is one PR. New rules start as warnings that only changed files must pass, get promoted one at a time, and CI gates come last.

- [ ] **1. <Title>**: <one-sentence goal>.
  - Changes: <packages, files, config keys, scripts>
  - Commands: <what the step adds, e.g. `pnpm deadcode`>
  - Done when: <a checkable condition, e.g. "knip reports 0 issues; CI job `deadcode` green">
  - Depends on: <earlier step, or none>
- [ ] **2. <Title>**: …

## Skipped

- **<Move>:** <reason>. Revisit when <condition>.

## Log

<Rollout steps append here: date, step, branch or PR, numbers before → after, and anything that changed the plan.>
