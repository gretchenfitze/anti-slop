// Lints throwaway sources in a temp dir and checks each rule fires where it should, and only there.
// No fixture files in the repo, so lint, knip, jscpd, and tsconfig need no ignore entries for them.
// Run: node --test scripts/lint-rules/lint-rules.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import plugin from "./index.cjs";

const oxlint = path.resolve(import.meta.dirname, "../../node_modules/.bin/oxlint");
const config = {
  jsPlugins: [path.join(import.meta.dirname, "index.cjs")],
  categories: { correctness: "off" },
  rules: Object.fromEntries(Object.keys(plugin.rules).map((rule) => [`${plugin.meta.name}/${rule}`, "error"])),
};

// Lints { "path/file.ts": source } and returns "path/file.ts:line" for each hit of the rule.
const hits = (rule, files) => {
  const dir = mkdtempSync(path.join(tmpdir(), "lint-rules-"));

  try {
    writeFileSync(path.join(dir, ".oxlintrc.json"), JSON.stringify(config));

    for (const [file, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), source);
    }

    const { stdout } = spawnSync(oxlint, ["-c", ".oxlintrc.json", "--format", "json", "."], {
      cwd: dir,
      encoding: "utf8",
    });

    return JSON.parse(stdout)
      .diagnostics.filter((d) => d.code === `${plugin.meta.name}(${rule})`)
      .map((d) => `${d.filename}:${d.labels[0].span.line}`)
      .toSorted();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("no-rounding-in-services reports rounding in a service, not in a formatter", () => {
  assert.deepEqual(
    hits("no-rounding-in-services", {
      "services/payroll.ts": [
        "export const totalHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;",
        "export const totalLabel = (hours: number) => hours.toFixed(1);",
      ].join("\n"),
      "formatters/hours.ts": "export const formatHours = (hours: number) => `${Math.round(hours * 10) / 10}h`;",
    }),
    ["services/payroll.ts:1", "services/payroll.ts:2"],
  );
});
