// Posts a report as one PR comment and updates that comment on later pushes, so each report keeps a
// single current comment. The report's first line is its marker (`<!-- prose-report -->`), which
// tells reports apart. Needs an authenticated `gh` (GH_TOKEN in CI) inside a checkout of the repo.
// Usage: node scripts/pr-comment.mjs <pr-number> < report.md
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// GitHub rejects comment bodies over 65,536 characters.
const LIMIT = 60_000;

const [pr = ""] = process.argv.slice(2);

if (!/^\d+$/.test(pr)) {
  console.error("usage: pr-comment.mjs <pr-number> < report.md");
  process.exit(1);
}

let body = readFileSync(0, "utf8");
const marker = body.split("\n", 1)[0].trim();

if (!/^<!-- [\w-]+ -->$/.test(marker)) {
  console.error(`The report's first line must be its marker, like <!-- prose-report -->. Got: ${marker}`);
  process.exit(1);
}

if (body.length > LIMIT) {
  const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL } = process.env;
  const log = GITHUB_RUN_ID
    ? `[the job log](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})`
    : "the job log";

  body = `${body.slice(0, body.lastIndexOf("\n", LIMIT))}\n\n_Cut to fit a comment. The full report is in ${log}._\n`;
}

const gh = (args, input) => execFileSync("gh", ["api", ...args], { encoding: "utf8", input });
const existing = gh([
  "--paginate",
  `repos/{owner}/{repo}/issues/${pr}/comments`,
  "--jq",
  `.[] | select(.body | startswith(${JSON.stringify(marker)})) | .id`,
])
  .split("\n")
  .find(Boolean);
const payload = JSON.stringify({ body });

if (existing) gh(["-X", "PATCH", `repos/{owner}/{repo}/issues/comments/${existing}`, "--input", "-"], payload);
else gh(["-X", "POST", `repos/{owner}/{repo}/issues/${pr}/comments`, "--input", "-"], payload);
