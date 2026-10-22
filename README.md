# Anti-slop

Two agent skills that harden a TypeScript or React repo against AI-generated slop. One measures which checks a project actually needs and plans them as small PRs; the other rolls the plan out one PR at a time.

Companion to [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review) by [Yuri Mikhin](https://github.com/mikhin).

<img src="https://cdn.evilmartians.com/badges/logo-no-label.svg" alt="Evil Martians logo" width="22" height="16" /> These skills are built by <b><a href="https://evilmartians.com">Evil Martians</a></b>, an American design and engineering consultancy for <b>developer tools, AI, and cybersecurity startups</b>.

## The skills

| Skill | What it does | Changes |
|---|---|---|
| `anti-slop-audit` | Runs every check read-only (tsc flags, oxlint with sonarjs and effect rules, knip, jscpd, react-doctor), removes framework false positives, mines past bugs for custom lint rules, and writes a PR-by-PR plan | `anti-slop/plan.md` and `anti-slop/todo.md` only |
| `anti-slop-rollout` | Takes the next step of the plan: adds one check, fixes or baselines what it finds, documents the commands for agents and humans, verifies, opens the PR | one branch and PR per run |

The audit judges each move against the project instead of applying all ten. It skips the API contract on a site without an API, defers mutation testing when the test runner has no Stryker runner, and separates the dead files knip reports from the ones that are actually dead.

It covers three stages:

- **An existing codebase** gets a gradual rollout: warnings on changed files first, CI gates last.
- **A prototype turning into a product** gets a plan scoped to the code that survives, with new slop stopped before the old gets cleaned.
- **A project just starting** gets a short day-one plan with every check as an error, since there's nothing to clean up yet. If the stack is Vite + React or NestJS, [Yuri Mikhin](https://github.com/mikhin)'s [ts-workbench](https://github.com/mikhin/ts-workbench) template is often the faster start, and the audit says so.

The audit reads the stack from the repo (linter, test runner, e2e, API, package manager, git hooks, agents, CI) and picks tools to match: rule sets for ESLint, oxlint, or Biome, Jest or Vitest mock checks, the project's package manager in every command.

Four choices have two reasonable answers. The plan takes option 1, what the article recommends, and the audit's report asks whether to switch any:

| Choice | Option 1 (the article) | Option 2 |
|---|---|---|
| Lint backlog | **Gradual:** warnings on changed files, old code left as-is, a rule promoted once it catches a real bug | **Cleanup:** PRs that fix the backlog to zero, no `warn` left |
| Mutation testing in CI | **Required,** with no score threshold | **Report-only,** never blocks a PR |
| `exactOptionalPropertyTypes` | **Always on** | **Count-gated:** on only when the error count is small |
| react-doctor (React) | **Report:** a command and a scheduled run | **Gated:** errors cleaned up, then blocking |

## Install

Install both skills: the rollout runs the audit's probe from the folder next to it.

```sh
npx skills add gretchenfitze/anti-slop --skill '*' -a claude-code -g
```

Pass your agent to `-a`: `claude-code`, `codex`, `cursor`, `gemini-cli`, or `github-copilot`. Drop `-g` to install into the current project instead of your home directory.

Claude Code can install the bundle from this repo's plugin marketplace instead:

```sh
claude plugin marketplace add gretchenfitze/anti-slop
claude plugin install anti-slop@gretchenfitze-anti-slop
```

Alternatively, GitHub CLI's `gh skill` can install each skill and prompts you to pick which agent to install it into:

```sh
gh skill install gretchenfitze/anti-slop anti-slop-audit
gh skill install gretchenfitze/anti-slop anti-slop-rollout
```

Or copy both folders from `skills/` into a skills directory yourself: `.claude/skills` for Claude Code, `.codex/skills` for Codex, or the agent-agnostic `.agents/skills`, which any agent reads. Prefix the path with `~/` to install them globally, or use it at a project root to keep them local. Copy whole folders, not just the `SKILL.md` files, since both skills ship scripts, references, and templates alongside them.

## Use

```
> audit this repo for AI slop
> we're turning this vibe-coded prototype into a real product: which checks do we need?
> starting a new Next.js app, set it up so the agents don't make a mess from day one
> do the next anti-slop step
> do step 4 of the anti-slop plan, but don't open a PR
```

Or call a skill directly. With the Claude Code plugin, skill commands are namespaced by the plugin name; other installs use the bare skill name (`/anti-slop-audit`):

```
> /anti-slop:anti-slop-audit
> /anti-slop:anti-slop-rollout
```

The plan lives in `anti-slop/` in your repo: `todo.md` is the step checklist, what's done and what's next, and `plan.md` holds the numbers, the reasoning, and the log, so any session or teammate can pick up the next step. The scripts, hook, and project lint rules the rollout adds outlive it, so they go in your project's tooling folder (`scripts/` by default). The last step deletes `anti-slop/`.

## Requirements

Git, Node 22+ with npm 11.10+, network access for `npx`, and installed project dependencies. The audit installs nothing into the project: tools run through `npx` or a temp directory. react-doctor always runs as `npx -y --min-release-age=7 react-doctor@latest --no-telemetry --no-supply-chain`: never a version younger than a week, and nothing about the project leaves the machine except package downloads.

## Credits

The detector scripts in `skills/anti-slop-rollout/assets/scripts/` (dead files, dead mocks, jscpd triage, mutation on changed files, mutation PR report) come from [Yuri Mikhin](https://github.com/mikhin)'s [ts-workbench](https://github.com/mikhin/ts-workbench), a template repo with all ten moves applied. `resolve-module.mjs` is generalized here for existing repos, and `find-dead-mocks.mjs` for Jest as well as Vitest.

## License

MIT
