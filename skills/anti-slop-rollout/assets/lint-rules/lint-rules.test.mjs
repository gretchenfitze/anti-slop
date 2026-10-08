// Runs the linter over fixtures/ and checks each rule fires where it should, and only there.
// Run: node --test anti-slop/lint-rules/lint-rules.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

const fixtures = path.join(import.meta.dirname, "fixtures");
const oxlint = path.resolve(import.meta.dirname, "../../node_modules/.bin/oxlint");

const { stdout } = spawnSync(oxlint, ["-c", ".oxlintrc.json", "--format", "json", "."], {
  cwd: fixtures,
  encoding: "utf8",
});
const diagnostics = JSON.parse(stdout).diagnostics;

const hits = (rule) =>
  diagnostics
    .filter((d) => d.code === `local(${rule})`)
    .map((d) => path.relative(fixtures, path.resolve(fixtures, d.filename)))
    .toSorted();

test("no-rounding-in-services reports rounding in a service, not in a formatter", () => {
  assert.deepEqual(hits("no-rounding-in-services"), ["services/payroll.ts", "services/payroll.ts"]);
});
