import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { isGitRepo } from './merge.js';
import { writeState } from './state.js';
import { SkillState } from './types.js';

const NANOCLAW_DIR = '.nanoclaw';
const BASE_DIR = path.join(NANOCLAW_DIR, 'base');

// Directories within src/ to exclude from base snapshot
const EXCLUDE_DIRS = ['skills-engine'];

export function initNanoclawDir(): void {
  const projectRoot = process.cwd();
  const nanoclawDir = path.join(projectRoot, NANOCLAW_DIR);
  const baseDir = path.join(projectRoot, BASE_DIR);

  // Create structure
  fs.mkdirSync(path.join(nanoclawDir, 'backup'), { recursive: true });

  // Copy src/ to base (excluding skills-engine/)
  const srcDir = path.join(projectRoot, 'src');
  const baseSrcDir = path.join(baseDir, 'src');

  // Clean existing base
  if (fs.existsSync(baseSrcDir)) {
    fs.rmSync(baseSrcDir, { recursive: true, force: true });
  }

  copyDirFiltered(srcDir, baseSrcDir, EXCLUDE_DIRS);

  // Create initial state
  const coreVersion = getCoreVersion(projectRoot);
  const initialState: SkillState = {
    skills_system_version: '0.1.0',
    core_version: coreVersion,
    applied_skills: [],
  };
  writeState(initialState);

  // Enable git rerere if in a git repo
  if (isGitRepo()) {
    try {
      execSync('git config rerere.enabled true', { stdio: 'pipe' });
    } catch {
      // Non-fatal
    }
  }
}

function copyDirFiltered(
  src: string,
  dest: string,
  excludes: string[],
): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.includes(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getCoreVersion(projectRoot: string): string {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
