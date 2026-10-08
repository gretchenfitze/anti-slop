#!/usr/bin/env node
// Measures what each anti-slop move would find in the repo in the current directory.
// Read-only: tools run from npx or a temp install, reports land in a temp dir.
//
//   node probe.mjs [--only stack,tsc,lint,knip,jscpd,doctor,scars] [--skip ...] [--out <dir>]
//
// Prints a Markdown summary to stdout and writes the full data to <out>/probe.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const list = (name) => new Set((flag(name) ?? '').split(',').filter(Boolean));
const only = list('--only');
const skip = list('--skip');
const want = (name) => !skip.has(name) && (only.size === 0 || only.has(name));
const OUT = flag('--out') ?? mkdtempSync(path.join(tmpdir(), 'anti-slop-probe-'));
mkdirSync(OUT, { recursive: true });

const log = (msg) => process.stderr.write(`probe: ${msg}\n`);

const run = (cmd, argv, { timeout = 900_000, cwd = ROOT } = {}) => {
  const start = Date.now();
  const r = spawnSync(cmd, argv, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
  });
  return {
    code: r.status,
    out: r.stdout ?? '',
    err: r.stderr ?? '',
    failed: Boolean(r.error) || r.status === null,
    timedOut: r.error?.code === 'ETIMEDOUT',
    seconds: Math.round((Date.now() - start) / 100) / 10,
  };
};
// npx downloads on first use; fetch the tool first so the timed run measures only the tool.
const npxTimed = (pkg, argv) => {
  run('npx', ['-y', pkg, '--version']);
  return run('npx', ['-y', pkg, ...argv]);
};

const read = (file) => {
  try {
    return readFileSync(path.resolve(ROOT, file), 'utf8');
  } catch {
    return null;
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(read(file));
  } catch {
    return null;
  }
};
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    try {
      return start === -1 ? null : JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
};
const countBy = (items, key) => {
  const counts = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).toSorted((a, b) => b[1] - a[1]));
};
const top = (obj, n) => Object.fromEntries(Object.entries(obj).slice(0, n));
const dirOf = (file, depth = 2) => file.split('/').slice(0, depth).join('/');
const localBin = (name) => {
  const bin = path.join(ROOT, 'node_modules', '.bin', name);
  return existsSync(bin) ? bin : null;
};

const CODE_RE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const TEMPLATE_RE = /\.(?:vue|svelte|astro)$/;
const TEST_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//;
const GENERATED_RE = /(?:^|\/)(?:generated|__generated__|dist|build|coverage)\//;

const result = { root: ROOT, out: OUT, generatedAt: new Date().toISOString() };
// Seconds per check on this repo: where a check can run (agent hook, pre-commit, CI, schedule) depends on it.
const timings = {};

// ---------------------------------------------------------------- stack

const gitFiles = run('git', ['ls-files', '-co', '--exclude-standard']);
if (gitFiles.code !== 0) {
  console.error('probe: run this inside a git repository.');
  process.exit(1);
}
const files = gitFiles.out.split('\n').filter(Boolean);
const codeFiles = files.filter((f) => CODE_RE.test(f) && !f.endsWith('.d.ts'));
const sourceFiles = codeFiles.filter((f) => !TEST_RE.test(f) && !GENERATED_RE.test(f));
const exists = (f) => files.includes(f) || existsSync(path.join(ROOT, f));

const packageJsons = files.filter((f) => f.endsWith('package.json'));
const rootPkg = readJson('package.json') ?? {};
const deps = {};
for (const file of packageJsons) {
  const pkg = readJson(file) ?? {};
  Object.assign(deps, pkg.peerDependencies, pkg.devDependencies, pkg.dependencies);
}
const has = (name) => name in deps;
const scripts = rootPkg.scripts ?? {};
const scriptsText = Object.values(scripts).join('\n');
const pick = (map) =>
  Object.entries(map)
    .filter(([, test]) => test())
    .map(([name]) => name);
const anyFile = (re) => files.some((f) => re.test(f));

const ciFiles = files.filter((f) =>
  /^\.github\/workflows\/.+\.ya?ml$|^\.gitlab-ci\.ya?ml$|^\.circleci\/config\.ya?ml$|^bitbucket-pipelines\.ya?ml$|^azure-pipelines\.ya?ml$/.test(
    f,
  ),
);
const ciText = ciFiles.map(read).join('\n');
// Commit subjects that GitHub, GitLab, and Bitbucket write when a PR merges. Rebase merges leave none.
const PR_MERGE_RE = /^Merge pull request #|\(#\d+\)$|^Merged in .+\(pull request #\d+\)|^Merge branch '.+' into '/;
// CI usually calls package scripts by name: pull their bodies in so `pnpm lint` counts as oxlint.
const ciHaystack = [
  ciText,
  ...Object.entries(scripts)
    .filter(([name]) =>
      new RegExp(`(?:run|pnpm|yarn|bun)\\s+(?:run\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'm').test(ciText),
    )
    .map(([, body]) => body),
].join('\n');

const claudeSettings = readJson('.claude/settings.json');
const playwrightConfig = files.find((f) => /(?:^|\/)playwright\.config\.[cm]?[jt]s$/.test(f));
const playwrightTestDir = playwrightConfig
  ? (read(playwrightConfig)?.match(/testDir\s*:\s*['"`]([^'"`]+)/)?.[1] ?? null)
  : null;
const e2eGlobs = playwrightTestDir
  ? [path.posix.join(path.posix.dirname(playwrightConfig), playwrightTestDir.replace(/^\.\//, ''), '**')]
  : ['**/e2e/**', '**/*.e2e.*'];
const isE2e = (file) => e2eGlobs.some((glob) => path.matchesGlob(file, glob));
// The probe's oxlint config lives in a temp dir, and oxlint resolves override globs from there.
const anywhere = (glob) => (glob.startsWith('**/') ? glob : `**/${glob}`);

const stack = {
  packageManager:
    pick({
      pnpm: () => exists('pnpm-lock.yaml'),
      yarn: () => exists('yarn.lock'),
      npm: () => exists('package-lock.json'),
      bun: () => exists('bun.lock') || exists('bun.lockb'),
    })[0] ?? 'unknown',
  monorepo: Boolean(rootPkg.workspaces) || /^packages\s*:/m.test(read('pnpm-workspace.yaml') ?? ''),
  frameworks: pick({
    next: () => has('next'),
    astro: () => has('astro'),
    remix: () => has('@remix-run/react'),
    'react-router': () => has('@react-router/dev'),
    'tanstack-start': () => has('@tanstack/react-start'),
    vite: () => has('vite'),
    gatsby: () => has('gatsby'),
    expo: () => has('expo'),
    'react-native': () => has('react-native'),
    vue: () => has('vue'),
    nuxt: () => has('nuxt'),
    svelte: () => has('svelte'),
    angular: () => has('@angular/core'),
    solid: () => has('solid-js'),
  }),
  react: deps.react ?? null,
  typescript: deps.typescript ?? null,
  linters: pick({
    eslint: () => has('eslint') || anyFile(/(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.\w+)?)$/),
    oxlint: () => has('oxlint') || anyFile(/(?:^|\/)(?:\.oxlintrc\.json|oxlint\.config\.[cm]?[jt]s)$/),
    biome: () => has('@biomejs/biome') || anyFile(/(?:^|\/)biome\.jsonc?$/),
  }),
  formatters: pick({
    prettier: () => has('prettier'),
    oxfmt: () => has('oxfmt'),
    biome: () => has('@biomejs/biome'),
    dprint: () => has('dprint'),
  }),
  unitTests: pick({
    vitest: () => has('vitest'),
    jest: () => has('jest'),
    'node:test': () => /node\s+(?:--\S+\s+)*--test\b|\bbnt\b|better-node-test/.test(scriptsText),
    mocha: () => has('mocha'),
    bun: () => /\bbun test\b/.test(scriptsText),
  }),
  e2e: pick({
    playwright: () => has('@playwright/test') || has('playwright'),
    cypress: () => has('cypress'),
  }),
  e2eGlobs,
  gitHooks: pick({
    lefthook: () => has('lefthook') || anyFile(/^\.?lefthook\.ya?ml$/),
    husky: () => has('husky') || anyFile(/^\.husky\//),
    'simple-git-hooks': () => has('simple-git-hooks'),
    'lint-staged': () => has('lint-staged'),
    'nano-staged': () => has('nano-staged'),
  }),
  agentFiles: files
    .filter((f) =>
      /(?:^|\/)(?:AGENTS|CLAUDE|CONVENTIONS|CONTRIBUTING)\.md$|^\.cursor\/rules\/|^\.cursorrules$|^\.github\/copilot-instructions\.md$/.test(
        f,
      ),
    )
    .slice(0, 30),
  agentHooks: claudeSettings?.hooks ? Object.keys(claudeSettings.hooks) : [],
  ci: {
    files: ciFiles,
    scheduled: /\bschedule\b|\bcron\b/i.test(ciText),
    checks: pick({
      lint: () => /\b(?:eslint|oxlint|biome (?:check|lint|ci))\b/.test(ciHaystack),
      format: () => /\b(?:prettier|oxfmt|biome (?:check|format|ci)|dprint)\b/.test(ciHaystack),
      typecheck: () => /\b(?:tsc|typecheck|vue-tsc|svelte-check|astro check)\b/.test(ciHaystack),
      unit: () => /\b(?:vitest|jest|node\s+(?:--\S+\s+)*--test|bnt|mocha|bun test)\b/.test(ciHaystack),
      e2e: () => /\b(?:playwright|cypress)\b/.test(ciHaystack),
      build: () => /\bbuild\b/.test(ciHaystack),
      knip: () => /\bknip\b/.test(ciHaystack),
      jscpd: () => /\bjscpd\b/.test(ciHaystack),
      mutation: () => /\bstryker\b/.test(ciHaystack),
      'react-doctor': () => /\breact-doctor\b/.test(ciHaystack),
    }),
  },
  api: {
    specs: files.filter((f) => /(?:openapi|swagger)[^/]*\.(?:json|ya?ml)$/i.test(f)).slice(0, 10),
    tooling: pick({
      '@hey-api/openapi-ts': () => has('@hey-api/openapi-ts'),
      'openapi-typescript': () => has('openapi-typescript'),
      orval: () => has('orval'),
      'openapi-fetch': () => has('openapi-fetch'),
      zod: () => has('zod'),
      graphql: () => has('graphql'),
      '@graphql-codegen/cli': () => has('@graphql-codegen/cli'),
      trpc: () => has('@trpc/server') || has('@trpc/client'),
    }),
  },
  boundaryTooling: pick({
    'eslint-plugin-boundaries': () => has('eslint-plugin-boundaries'),
    'dependency-cruiser': () => has('dependency-cruiser') || anyFile(/(?:^|\/)\.dependency-cruiser\.[cm]?js$/),
  }),
  topLevelSourceDirs: countBy(
    sourceFiles.filter((f) => /^(?:src|app|apps\/[^/]+\/src|packages\/[^/]+\/src)\//.test(f)),
    (f) => dirOf(f, f.startsWith('src/') || f.startsWith('app/') ? 2 : 4),
  ),
};

// Grep-level signals over source code: cheap context for several moves.
const signals = { fetchCalls: 0, axiosCalls: 0, useEffect: 0, viMock: 0, jestMock: 0 };
const suppressions = { lintDisable: 0, tsIgnore: 0, tsExpectError: 0, asAny: 0 };
let loc = 0;
const texts = new Map();
for (const file of codeFiles) {
  const text = read(file) ?? '';
  texts.set(file, text);
  const count = (re) => (text.match(re) ?? []).length;
  if (!TEST_RE.test(file)) {
    loc += text.split('\n').length;
    signals.fetchCalls += count(/\bfetch\(/g);
    signals.axiosCalls += count(/\baxios(?:\.\w+)?\(/g);
    signals.useEffect += count(/\buse(?:Layout)?Effect\(/g);
  }
  signals.viMock += count(/\bvi\.mock\(/g);
  signals.jestMock += count(/\bjest\.mock\(/g);
  suppressions.lintDisable += count(/(?:eslint|oxlint|biome)-(?:disable|ignore)/g);
  suppressions.tsIgnore += count(/@ts-ignore/g);
  suppressions.tsExpectError += count(/@ts-expect-error/g);
  suppressions.asAny += count(/\bas any\b/g);
}

const gitOut = (argv) => run('git', argv).out.trim();
const repo = {
  firstCommit: gitOut(['log', '--max-parents=0', '--format=%ad', '--date=short']).split('\n').pop() || null,
  commitsLast90Days: Number(gitOut(['rev-list', '--count', '--since=90.days', 'HEAD'])) || 0,
  authorsLast90Days: gitOut(['shortlog', '-sne', '--since=90.days', 'HEAD']).split('\n').filter(Boolean).length,
  prMergesLast90Days: gitOut(['log', '--since=90.days', '--format=%s', 'HEAD'])
    .split('\n')
    .filter((s) => PR_MERGE_RE.test(s)).length,
  codeFiles: codeFiles.length,
  sourceFiles: sourceFiles.length,
  testFiles: codeFiles.filter((f) => TEST_RE.test(f) && !isE2e(f)).length,
  e2eFiles: codeFiles.filter(isE2e).length,
  sourceLines: loc,
};

const STRYKER_RUNNERS = { vitest: true, jest: true, mocha: true, 'node:test': false, bun: false };
const mutation = {
  runners: stack.unitTests,
  strykerRunnerAvailable: stack.unitTests.some((r) => STRYKER_RUNNERS[r]),
  testFiles: repo.testFiles,
};

if (want('stack')) Object.assign(result, { stack, repo, signals, suppressions, mutation });

// ---------------------------------------------------------------- tsc

const TSC_FLAGS = ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes'];
const tscErrors = (out) => {
  const lines = out.split('\n').filter((l) => /error TS\d+/.test(l));
  const byDir = countBy(
    lines.map((l) => l.match(/^(.+?)\(\d+,\d+\)/)?.[1]).filter(Boolean),
    (f) => dirOf(f),
  );
  return { count: lines.length, byDir: top(byDir, 8), sample: lines.slice(0, 6).map((l) => l.trim().slice(0, 240)) };
};

if (want('tsc')) {
  const tsc = localBin('tsc');
  const tsconfig = exists('tsconfig.json') ? 'tsconfig.json' : null;
  if (!tsc || !tsconfig) {
    result.tsc = { skipped: !tsc ? 'typescript is not installed locally (install dependencies first)' : 'no tsconfig.json at the root' };
  } else {
    log('tsc: resolving tsconfig');
    const shown = parseJson(run(tsc, ['--showConfig', '-p', tsconfig]).out) ?? {};
    const options = shown.compilerOptions ?? {};
    const projects =
      shown.references && !(shown.files?.length || shown.include?.length)
        ? shown.references.slice(0, 6).map((r) => r.path)
        : [tsconfig];
    // A solution-style root (Vite's default) keeps its options in the referenced projects: a flag counts
    // as on only when every project has it.
    const projectOptions =
      projects[0] === tsconfig ? [options] : projects.map((p) => parseJson(run(tsc, ['--showConfig', '-p', p]).out)?.compilerOptions ?? {});
    // TypeScript 6 turned `strict` on by default, and --showConfig doesn't print defaults.
    const tsMajor = Number(run(tsc, ['--version']).out.match(/(\d+)\./)?.[1] ?? 0);
    const isOn = (o, f) => o[f] === true || (f === 'strict' && tsMajor >= 6 && o[f] !== false);
    const enabled = Object.fromEntries(TSC_FLAGS.map((f) => [f, projectOptions.every((o) => isOn(o, f))]));
    const measure = (extra) => {
      const merged = { count: 0, byDir: {}, sample: [], seconds: 0 };
      for (const project of projects) {
        const r = run(tsc, ['--noEmit', '-p', project, ...extra]);
        const e = tscErrors(r.out);
        merged.count += e.count;
        merged.seconds += r.seconds;
        Object.assign(merged.byDir, e.byDir);
        merged.sample.push(...e.sample);
      }
      return merged;
    };
    log('tsc: baseline');
    const baseline = measure([]);
    timings.typecheck = Math.round(baseline.seconds * 10) / 10;
    const flags = {};
    for (const name of TSC_FLAGS) {
      if (enabled[name]) continue;
      if (name !== 'strict' && !enabled.strict) continue; // strict first, the rest on top of it
      log(`tsc: --${name}`);
      const e = measure([`--${name}`]);
      flags[name] = { newErrors: Math.max(0, e.count - baseline.count), byDir: e.byDir, sample: e.sample.slice(0, 6) };
    }
    result.tsc = {
      projects,
      enabled,
      baselineErrors: baseline.count,
      flags,
      note: stack.frameworks.some((f) => ['astro', 'vue', 'nuxt', 'svelte'].includes(f))
        ? 'tsc does not see .astro/.vue/.svelte files; counts are a lower bound'
        : undefined,
    };
  }
}

// ---------------------------------------------------------------- lint (oxlint as the measuring instrument)

const NATIVE_RULES = [
  'typescript/no-explicit-any',
  'typescript/no-non-null-assertion',
  'typescript/consistent-type-definitions',
  'typescript/explicit-module-boundary-types',
  'import/no-cycle',
];

if (want('lint')) {
  const dir = path.join(OUT, 'lint');
  mkdirSync(dir, { recursive: true });
  const react = Boolean(stack.react);
  const playwright = stack.e2e.includes('playwright');
  const packages = [
    'oxlint@latest',
    'eslint-plugin-sonarjs@latest',
    ...(react ? ['eslint-plugin-react-you-might-not-need-an-effect@latest'] : []),
    ...(playwright ? ['eslint-plugin-playwright@latest'] : []),
  ];
  log(`lint: installing ${packages.join(' ')} into a temp dir`);
  writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}');
  const install = run('npm', ['install', '--no-audit', '--no-fund', '--silent', ...packages], { cwd: dir });
  if (install.code !== 0) {
    result.lint = { skipped: `npm install failed: ${install.err.slice(0, 400)}` };
  } else {
    const resolve = (name) =>
      run(
        process.execPath,
        ['--input-type=module', '-e', `console.log(new URL(import.meta.resolve(${JSON.stringify(name)})).pathname)`],
        { cwd: dir },
      ).out.trim();
    const sonar = resolve('eslint-plugin-sonarjs');
    const effect = react ? resolve('eslint-plugin-react-you-might-not-need-an-effect') : null;
    const pw = playwright ? resolve('eslint-plugin-playwright') : null;
    const ruleNames = (entry) =>
      Object.keys(
        parseJson(
          run(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              `const m = await import(${JSON.stringify(entry)}); console.log(JSON.stringify((m.default ?? m).rules ?? {}))`,
            ],
            { cwd: dir },
          ).out,
        ) ?? {},
      );
    const sonarRecommended = parseJson(
      run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(sonar)}); const p = m.default ?? m; console.log(JSON.stringify(p.configs?.recommended?.rules ?? {}))`,
        ],
        { cwd: dir },
      ).out,
    );
    const rules = Object.fromEntries(NATIVE_RULES.map((r) => [r, 'warn']));
    for (const [rule, level] of Object.entries(sonarRecommended ?? {})) {
      const value = Array.isArray(level) ? level[0] : level;
      if (value !== 'off' && value !== 0) rules[rule] = 'warn';
    }
    if (effect) for (const r of ruleNames(effect)) rules[`react-you-might-not-need-an-effect/${r}`] = 'warn';
    if (stack.unitTests.includes('vitest')) Object.assign(rules, { 'vitest/expect-expect': 'warn', 'vitest/no-focused-tests': 'warn' });
    if (stack.unitTests.includes('jest')) Object.assign(rules, { 'jest/expect-expect': 'warn', 'jest/no-focused-tests': 'warn' });
    const overrides = [
      // oxlint reads only the script part of template files, so anything used in the template looks unused.
      {
        files: ['**/*.astro', '**/*.vue', '**/*.svelte'],
        rules: { 'sonarjs/unused-import': 'off', 'sonarjs/no-unused-vars': 'off', 'sonarjs/no-dead-store': 'off' },
      },
    ];
    if (pw) {
      overrides.push({
        files: e2eGlobs.map(anywhere),
        rules: Object.fromEntries(
          ['no-conditional-in-test', 'missing-playwright-await', 'no-focused-test', 'no-skipped-test', 'no-wait-for-timeout'].map(
            (r) => [`playwright/${r}`, 'warn'],
          ),
        ),
      });
    }
    const plugins = ['typescript', 'import', 'unicorn', 'oxc'];
    if (react) plugins.push('react', 'jsx-a11y');
    if (stack.unitTests.includes('vitest')) plugins.push('vitest');
    if (stack.unitTests.includes('jest')) plugins.push('jest');
    const config = {
      plugins,
      jsPlugins: [sonar, effect, pw].filter(Boolean),
      categories: { correctness: 'warn' },
      rules,
      overrides,
    };
    const configPath = path.join(dir, '.oxlintrc.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    log('lint: running oxlint with sonarjs and friends (may take a few minutes)');
    const lint = run(path.join(dir, 'node_modules', '.bin', 'oxlint'), ['-c', configPath, '--format', 'json', '.']);
    const report = parseJson(lint.out);
    if (!report) {
      result.lint = { skipped: `oxlint failed: ${(lint.out + lint.err).slice(0, 600)}` };
    } else {
      writeFileSync(path.join(OUT, 'lint.json'), lint.out);
      timings.lint = lint.seconds;
      const diagnostics = (report.diagnostics ?? []).map((d) => ({
        rule: d.code ?? 'unknown',
        file: path.relative(ROOT, path.resolve(ROOT, d.filename ?? '')),
      }));
      const byRule = countBy(diagnostics, (d) => d.rule);
      const group = (re) => Object.fromEntries(Object.entries(byRule).filter(([r]) => re.test(r)));
      const sumOf = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
      const sonarRules = group(/^sonarjs\(/);
      const effectRules = group(/^react-you-might-not-need-an-effect\(/);
      const native = Object.fromEntries(
        NATIVE_RULES.map((r) => {
          const [plugin, name] = r.split('/');
          return [r, byRule[`${plugin === 'typescript' ? 'typescript-eslint' : `eslint-plugin-${plugin}`}(${name})`] ?? byRule[`${plugin}(${name})`] ?? 0];
        }),
      );
      const topFilesFor = (re) =>
        top(
          countBy(
            diagnostics.filter((d) => re.test(d.rule)),
            (d) => dirOf(d.file),
          ),
          5,
        );
      result.lint = {
        totalDiagnostics: diagnostics.length,
        native,
        sonarjs: { total: sumOf(sonarRules), byRule: top(sonarRules, 25), byDir: topFilesFor(/^sonarjs\(/) },
        effects: effect ? { total: sumOf(effectRules), byRule: effectRules, byDir: topFilesFor(/^react-you-might-not-need-an-effect\(/) } : undefined,
        playwright: pw ? group(/^playwright\(/) : undefined,
        tests: group(/^(?:vitest|jest|eslint-plugin-(?:vitest|jest))\(/),
        jsxA11y: react ? { total: sumOf(group(/jsx-a11y\(/)), byRule: top(group(/jsx-a11y\(/), 10) } : undefined,
        otherCorrectness: top(
          Object.fromEntries(
            Object.entries(byRule).filter(
              ([r]) => !/^(?:sonarjs|react-you-might-not-need-an-effect|playwright)\(|jsx-a11y\(/.test(r) && !Object.keys(native).some((n) => r.endsWith(`(${n.split('/')[1]})`)),
            ),
          ),
          15,
        ),
        config: configPath,
      };
    }
  }
}

// ---------------------------------------------------------------- knip

if (want('knip')) {
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    result.knip = { skipped: 'node_modules is missing; knip needs installed dependencies' };
  } else {
    log('knip: running (uses the project knip config if there is one)');
    const r = npxTimed('knip@latest', ['--reporter', 'json', '--no-exit-code']);
    const report = parseJson(r.out);
    if (!report) {
      result.knip = { skipped: `knip failed: ${(r.out + r.err).slice(0, 600)}` };
    } else {
      writeFileSync(path.join(OUT, 'knip.json'), r.out);
      timings.knip = r.seconds;
      const counts = {};
      const names = {};
      const unusedFiles = [];
      for (const issue of report.issues ?? []) {
        for (const [key, value] of Object.entries(issue)) {
          if (key === 'file' || key === 'owners') continue;
          const entries = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
          if (entries.length === 0) continue;
          if (key === 'files') {
            unusedFiles.push(issue.file);
            continue;
          }
          counts[key] = (counts[key] ?? 0) + entries.length;
          if (['dependencies', 'devDependencies', 'unlisted', 'binaries', 'unresolved'].includes(key)) {
            names[key] = [...(names[key] ?? []), ...entries.flat().map((e) => e?.name ?? String(e))].slice(0, 30);
          }
        }
      }
      unusedFiles.push(...(report.files ?? []));
      const code = unusedFiles.filter((f) => CODE_RE.test(f));
      // knip says unused; a grep says why: used by tests only (fix entries), file-local (drop `export`),
      // or no reference at all (likely dead). "nameElsewhere" needs a human look.
      const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exportKinds = { testsOnly: [], fileLocal: [], noReferences: [], nameElsewhere: [], default: [] };
      for (const issue of report.issues ?? []) {
        for (const entry of [...(issue.exports ?? []), ...(issue.types ?? [])]) {
          const name = entry?.name;
          if (!name) continue;
          const label = `${issue.file}:${entry.line ?? '?'} ${name}`;
          if (name === 'default') {
            exportKinds.default.push(label);
            continue;
          }
          const word = new RegExp(`\\b${escape(name)}\\b`);
          const others = codeFiles.filter((f) => f !== issue.file && word.test(texts.get(f) ?? ''));
          const own = (texts.get(issue.file)?.match(new RegExp(word.source, 'g')) ?? []).length;
          if (others.length === 0) exportKinds[own > 1 ? 'fileLocal' : 'noReferences'].push(label);
          else if (others.every((f) => TEST_RE.test(f) || isE2e(f))) exportKinds.testsOnly.push(label);
          else exportKinds.nameElsewhere.push(label);
        }
      }
      result.knip = {
        configured: anyFile(/(?:^|\/)(?:knip\.jsonc?|\.knip\.jsonc?|knip\.config\.[cm]?[jt]s)$/) || Boolean(rootPkg.knip),
        unusedFiles: {
          total: unusedFiles.length,
          nonCode: unusedFiles.length - code.length,
          nonCodeByDir: top(countBy(unusedFiles.filter((f) => !CODE_RE.test(f)), (f) => dirOf(f)), 8),
          code: code.length,
          codeByDir: top(countBy(code, (f) => dirOf(f)), 10),
          codeSample: code.slice(0, 40),
        },
        counts,
        names,
        exportKinds: Object.fromEntries(Object.entries(exportKinds).map(([k, v]) => [k, v.slice(0, 40)])),
      };
    }
  }
}

// ---------------------------------------------------------------- jscpd

const LOGIC_FORMATS = ['typescript', 'javascript'];
const COMPONENT_FORMATS = ['tsx', 'jsx'];
const STYLE_FORMATS = ['css', 'scss'];

if (want('jscpd')) {
  const dir = path.join(OUT, 'jscpd');
  log('jscpd: running');
  const r = npxTimed('jscpd@latest', [
    '.',
    '--min-lines',
    '6',
    '--min-tokens',
    '40',
    '--format',
    [...LOGIC_FORMATS, ...COMPONENT_FORMATS, ...STYLE_FORMATS].join(','),
    '--ignore',
    '**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/*.d.ts,**/*.min.*,**/*.test.*,**/*.spec.*,**/__tests__/**,**/fixtures/**,**/generated/**,**/__generated__/**',
    '--reporters',
    'json,silent',
    '--output',
    dir,
  ]);
  const report = readJsonAbs(path.join(dir, 'jscpd-report.json'));
  if (!report) {
    result.jscpd = { skipped: `jscpd failed: ${(r.out + r.err).slice(0, 600)}` };
  } else {
    timings.jscpd = r.seconds;
    const formats = report.statistics?.formats ?? {};
    const share = (names) => {
      const lines = names.reduce((a, n) => a + (formats[n]?.lines ?? 0), 0);
      const dup = names.reduce((a, n) => a + (formats[n]?.duplicatedLines ?? 0), 0);
      const clones = names.reduce((a, n) => a + (formats[n]?.clones ?? 0), 0);
      return { clones, duplicatedLines: dup, lines, percentage: lines ? Number(((dup / lines) * 100).toFixed(2)) : 0 };
    };
    const largest = (names) =>
      (report.duplicates ?? [])
        .filter((d) => names.includes(d.format))
        .toSorted((a, b) => (b.lines ?? 0) - (a.lines ?? 0))
        .slice(0, 10)
        .map((d) => `${d.lines}L ${d.firstFile.name}:${d.firstFile.start} <> ${d.secondFile.name}:${d.secondFile.start}`);
    const total = report.statistics?.total ?? {};
    result.jscpd = {
      total: { clones: total.clones, percentage: Number((total.percentage ?? 0).toFixed(2)) },
      logic: { ...share(LOGIC_FORMATS), largest: largest(LOGIC_FORMATS) },
      components: { ...share(COMPONENT_FORMATS), largest: largest(COMPONENT_FORMATS) },
      styles: { ...share(STYLE_FORMATS), largest: largest(STYLE_FORMATS) },
      report: path.join(dir, 'jscpd-report.json'),
    };
  }
}

function readJsonAbs(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- react-doctor

if (want('doctor')) {
  if (!stack.react) {
    result.doctor = { skipped: 'no react dependency' };
  } else {
    log('react-doctor: running with --no-telemetry --no-supply-chain');
    // react-doctor also scans nested projects in gitignored folders (worktrees, vendored apps); keep a
    // single-package repo to its root.
    const scope = stack.monorepo ? [] : ['--project', '.'];
    const r = npxTimed('react-doctor@latest', ['--no-telemetry', '--no-supply-chain', '--json', '--blocking', 'none', ...scope, '.']);
    const report = parseJson(r.out);
    if (!report?.diagnostics) {
      result.doctor = { skipped: `react-doctor failed: ${(r.out + r.err).slice(0, 600)}` };
    } else {
      writeFileSync(path.join(OUT, 'react-doctor.json'), r.out);
      timings.reactDoctor = r.seconds;
      const d = report.diagnostics;
      result.doctor = {
        total: d.length,
        bySeverity: countBy(d, (x) => x.severity),
        byRule: top(countBy(d, (x) => x.rule), 20),
        byDir: top(countBy(d, (x) => dirOf(path.relative(ROOT, x.filePath))), 8),
        errors: d
          .filter((x) => x.severity === 'error')
          .slice(0, 25)
          .map((x) => `${x.rule} ${path.relative(ROOT, x.filePath)}:${x.line}`),
        score: report.summary?.score ?? null,
      };
    }
  }
}

// ---------------------------------------------------------------- scars

if (want('scars')) {
  const FIX_RE = /(?:^|[^a-z])(?:fix|fixes|fixed|bug|hotfix|revert|regression)(?:[^a-z]|$)/i;
  const fixCommits = gitOut(['log', '--no-merges', '--since=18.months', '--format=%h %ad %s', '--date=short', '-n', '2000'])
    .split('\n')
    .filter((line) => FIX_RE.test(line.split(' ').slice(2).join(' ')))
    .slice(0, 80);
  const ruleLines = [];
  for (const file of stack.agentFiles.filter((f) => f.endsWith('.md') || f.startsWith('.cursor'))) {
    const lines = (read(file) ?? '').split('\n');
    let fenced = false;
    lines.forEach((line, i) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      if (fenced) return;
      if (/\b(?:never|don['’]t|do not|must not|avoid|instead of|not allowed|forbidden)\b/i.test(line)) {
        ruleLines.push(`${file}:${i + 1}: ${line.trim().slice(0, 220)}`);
      }
    });
  }
  // Lines that name code (backticks, paths, calls) are the ones a linter could check: list them first.
  const codeLike = (line) => /`[^`]+`|\b[\w-]+\/[\w./-]+|\w\(\)/.test(line);
  const sorted = [...ruleLines.filter(codeLike).map((l) => `[code] ${l}`), ...ruleLines.filter((l) => !codeLike(l))];
  result.scars = { fixCommits, ruleLines: sorted.slice(0, 80), ruleLinesTotal: ruleLines.length };
}

// ---------------------------------------------------------------- output

if (Object.keys(timings).length) result.timings = timings;
writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(result, null, 2));

const md = [];
const kv = (obj) =>
  Object.entries(obj ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || 'none';
md.push(`# anti-slop probe: ${path.basename(ROOT)}`, '', `Full data: ${path.join(OUT, 'probe.json')}`, '');
if (result.stack) {
  const s = result.stack;
  md.push(
    '## Stack',
    '',
    `- package manager: ${s.packageManager}${s.monorepo ? ' (monorepo)' : ''}`,
    `- frameworks: ${s.frameworks.join(', ') || 'none detected'}; react ${s.react ?? 'no'}; typescript ${s.typescript ?? 'no'}`,
    `- linters: ${s.linters.join(', ') || 'none'}; formatters: ${s.formatters.join(', ') || 'none'}`,
    `- unit tests: ${s.unitTests.join(', ') || 'none'} (${result.repo.testFiles} files); e2e: ${s.e2e.join(', ') || 'none'} (${result.repo.e2eFiles} files under ${s.e2eGlobs.join(', ')})`,
    `- git hooks: ${s.gitHooks.join(', ') || 'none'}; agent hooks: ${s.agentHooks.join(', ') || 'none'}`,
    `- agent/convention files: ${s.agentFiles.join(', ') || 'none'}`,
    `- CI: ${s.ci.files.join(', ') || 'none'}; checks seen: ${s.ci.checks.join(', ') || 'none'}; scheduled runs: ${s.ci.scheduled ? 'yes' : 'none'}`,
    `- API: specs ${s.api.specs.join(', ') || 'none'}; tooling ${s.api.tooling.join(', ') || 'none'}; fetch( ${result.signals.fetchCalls}, axios ${result.signals.axiosCalls}`,
    `- boundary tooling: ${s.boundaryTooling.join(', ') || 'none'}; source dirs: ${kv(top(s.topLevelSourceDirs, 15))}`,
    `- repo: since ${result.repo.firstCommit}, ${result.repo.commitsLast90Days} commits (${result.repo.prMergesLast90Days} PR merges) and ${result.repo.authorsLast90Days} authors in 90 days, ${result.repo.sourceFiles} source files, ${result.repo.sourceLines} lines`,
    `- signals: useEffect ${result.signals.useEffect}, vi.mock ${result.signals.viMock}, jest.mock ${result.signals.jestMock}`,
    `- suppressions: ${kv(result.suppressions)}`,
    `- mutation: runners ${result.mutation.runners.join(', ') || 'none'}, Stryker runner ${result.mutation.strykerRunnerAvailable ? 'available' : 'not available'}`,
    '',
  );
}
const section = (title, data, body) => {
  md.push(`## ${title}`, '');
  if (!data) md.push('not run', '');
  else if (data.skipped) md.push(`skipped: ${data.skipped}`, '');
  else md.push(...body(data), '');
};
section('TypeScript', result.tsc, (t) => [
  `- already on: ${Object.entries(t.enabled).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}; baseline errors ${t.baselineErrors}`,
  ...Object.entries(t.flags).flatMap(([f, v]) => [`- --${f}: +${v.newErrors} errors (${kv(v.byDir)})`, ...v.sample.map((l) => `  - ${l}`)]),
  ...(t.note ? [`- note: ${t.note}`] : []),
]);
section('Lint (oxlint + jsPlugins, all warnings)', result.lint, (l) => [
  `- native: ${kv(l.native)}`,
  `- sonarjs: ${l.sonarjs.total} (${kv(l.sonarjs.byRule)}); by dir: ${kv(l.sonarjs.byDir)}`,
  ...(l.effects ? [`- unnecessary effects: ${l.effects.total} (${kv(l.effects.byRule)}); by dir: ${kv(l.effects.byDir)}`] : []),
  ...(l.playwright ? [`- playwright: ${kv(l.playwright)}`] : []),
  `- test rules: ${kv(l.tests)}`,
  ...(l.jsxA11y ? [`- jsx-a11y: ${l.jsxA11y.total} (${kv(l.jsxA11y.byRule)})`] : []),
  `- other oxlint correctness: ${kv(l.otherCorrectness)}`,
]);
section('Knip', result.knip, (k) => [
  `- project config: ${k.configured ? 'yes' : 'no (defaults; expect framework false positives)'}`,
  `- unused files: ${k.unusedFiles.total} (${k.unusedFiles.nonCode} non-code: ${kv(k.unusedFiles.nonCodeByDir)})`,
  `- unused code files: ${k.unusedFiles.code} (${kv(k.unusedFiles.codeByDir)})`,
  ...k.unusedFiles.codeSample.map((f) => `  - ${f}`),
  `- other issues: ${kv(k.counts)}`,
  ...Object.entries(k.names).map(([key, v]) => `- ${key}: ${v.join(', ')}`),
  '- unused exports and types, by what a grep finds:',
  ...Object.entries(k.exportKinds)
    .filter(([, v]) => v.length)
    .map(([key, v]) => `  - ${key} (${v.length}): ${v.join('; ')}`),
]);
section('jscpd', result.jscpd, (j) => [
  `- total: ${j.total.clones} clones, ${j.total.percentage}% of lines`,
  `- logic (ts/js): ${j.logic.clones} clones, ${j.logic.percentage}%`,
  ...j.logic.largest.map((x) => `  - ${x}`),
  `- components (tsx/jsx; hooks and handlers live here too, read them as logic): ${j.components.clones} clones, ${j.components.percentage}%`,
  ...j.components.largest.slice(0, 6).map((x) => `  - ${x}`),
  `- styles (css/scss): ${j.styles.clones} clones, ${j.styles.percentage}%`,
  ...j.styles.largest.slice(0, 3).map((x) => `  - ${x}`),
]);
section('react-doctor', result.doctor, (d) => [
  `- ${d.total} findings (${kv(d.bySeverity)}), score ${d.score ?? 'n/a'}`,
  `- top rules: ${kv(d.byRule)}`,
  `- by dir: ${kv(d.byDir)}`,
  ...d.errors.map((e) => `  - error: ${e}`),
]);
section('Scar candidates', result.scars, (s) => [
  `### Fix/revert commits, last 18 months (${s.fixCommits.length})`,
  '',
  ...s.fixCommits.map((c) => `- ${c}`),
  '',
  `### Prohibitions in agent/convention files (${s.ruleLinesTotal}, first 80)`,
  '',
  ...s.ruleLines.map((l) => `- ${l}`),
]);
if (result.timings) {
  md.push(
    '## Timings',
    '',
    `- seconds on this machine: ${kv(result.timings)}`,
    '- lint and react-doctor scanned the whole repo, and tsc ran without --incremental: on changed files and warm caches they run faster.',
    '',
  );
}
console.log(md.join('\n'));
