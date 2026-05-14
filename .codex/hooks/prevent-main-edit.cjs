#!/usr/bin/env node

const { execSync } = require("node:child_process");

function run(command) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const root = run("git rev-parse --show-toplevel") || process.cwd();
const branch = run(`git -C "${root}" branch --show-current`);

if (branch === "main") {
  const message =
    "Khong duoc edit tren main branch. Tao feature branch truoc: git checkout -b feat/ten-task";
  process.stderr.write(JSON.stringify({ block: true, message }));
  process.exit(2);
}

process.exit(0);
