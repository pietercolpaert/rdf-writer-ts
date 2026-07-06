#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' });

if (gitDirResult.status !== 0) {
  process.exit(0);
}

const hooksPath = '.githooks';
const hook = path.join(root, hooksPath, 'pre-commit');
if (!fs.existsSync(hook)) {
  console.warn(`Skipping hook installation: ${hook} does not exist.`);
  process.exit(0);
}

fs.chmodSync(hook, 0o755);
const configResult = spawnSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: root, stdio: 'inherit' });
if (configResult.status !== 0) process.exit(configResult.status ?? 1);
console.log(`Installed Git hooks from ${hooksPath}`);
