#!/usr/bin/env node

const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

function run(command) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr) : "";
    return `${stdout}\n${stderr}`.trim();
  }
}

const root = run("git rev-parse --show-toplevel") || process.cwd();
const eslintConfigFiles = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml",
];

if (!eslintConfigFiles.some((file) => existsSync(join(root, file)))) {
  process.stderr.write(
    "Codex post-edit lint skipped: ESLint config not found; npm run lint would prompt interactively."
  );
  process.exit(0);
}

const output = run(`npm --prefix "${root}" run lint --silent`);

if (output) {
  const lines = output.split(/\r?\n/).slice(0, 20).join("\n");
  process.stderr.write(lines);
}

process.exit(0);
