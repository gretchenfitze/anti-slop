// From ts-workbench (https://github.com/mikhin/ts-workbench) by Yuri Mikhin (https://github.com/mikhin), MIT.
// Generalized for existing repos: knip.json or knip.jsonc, source globs from knip's `project`,
// aliases from tsconfig `paths`, `.js` specifiers that point at `.ts`, and Vite `?query` suffixes.
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");

const stripJsonc = (text) => {
  let out = "";
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      out += char;

      if (char === "\\") out += text[++i] ?? "";
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) break;
      i += 1;
    } else {
      out += char;
    }
  }

  return out.replaceAll(/,(\s*[}\]])/g, "$1");
};

const readConfig = (file) => {
  try {
    return JSON.parse(stripJsonc(readFileSync(path.resolve(ROOT, file), "utf8")));
  } catch {
    return null;
  }
};

const knipConfig =
  ["knip.json", "knip.jsonc", ".knip.json", ".knip.jsonc"].map(readConfig).find(Boolean) ?? {};

const asList = (value) => (value === undefined ? [] : [value].flat());

const tsPaths = () => {
  let file = "tsconfig.json";

  for (let depth = 0; depth < 5; depth += 1) {
    const config = readConfig(file);
    const options = config?.compilerOptions ?? {};

    if (options.paths) {
      return { baseUrl: path.resolve(ROOT, path.dirname(file), options.baseUrl ?? "."), paths: options.paths };
    }

    const parent = asList(config?.extends).find((entry) => entry.startsWith("."));

    if (!parent) break;

    file = path.join(path.dirname(file), parent.endsWith(".json") ? parent : `${parent}.json`);
  }

  return { baseUrl: ROOT, paths: { "@/*": ["./src/*"] } };
};

const { baseUrl, paths } = tsPaths();

const aliases = Object.entries(paths).map(([key, [target]]) => ({
  prefix: key.replace(/\*$/, ""),
  wildcard: key.endsWith("*"),
  target: path.resolve(baseUrl, target.replace(/\*$/, "")),
}));

const ignoredByKnip = (file) =>
  asList(knipConfig.ignore).some((pattern) => path.matchesGlob(file, pattern));

const expand = (patterns) =>
  globSync(patterns, { cwd: ROOT, exclude: (file) => file.includes("node_modules") }).map(String);

export const knipEntries = () => expand(asList(knipConfig.entry)).map((entry) => path.resolve(ROOT, entry));

export const sourceFiles = () =>
  expand(asList(knipConfig.project ?? "src/**/*.{ts,tsx}"))
    .filter((file) => !/\.(spec|test)\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".d.ts"))
    .filter((file) => !ignoredByKnip(file))
    .toSorted();

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

const basePath = (specifier, fromFile) => {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fromFile), specifier);

  for (const { prefix, wildcard, target } of aliases) {
    if (wildcard ? specifier.startsWith(prefix) : specifier === prefix) {
      return path.join(target, specifier.slice(prefix.length));
    }
  }

  return null;
};

const isFile = (candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile();

// null: a package or something outside the repo; false: a local path that resolves to nothing.
export const resolveModule = (rawSpecifier, fromFile) => {
  const specifier = rawSpecifier.replace(/\?.*$/, "");
  const base = basePath(specifier, fromFile);

  if (base === null) return null;

  const found = CANDIDATE_SUFFIXES.map((suffix) => base + suffix).find(isFile);

  if (found) return found;

  const typescriptTwin = base.replace(/\.([cm]?)js(x?)$/, ".$1ts$2");

  return typescriptTwin !== base && isFile(typescriptTwin) ? typescriptTwin : false;
};
