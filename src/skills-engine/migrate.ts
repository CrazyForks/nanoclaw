import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { initNanoclawDir } from './init.js';

export function initSkillsSystem(): void {
  initNanoclawDir();
  console.log('Skills system initialized. .nanoclaw/ directory created.');
}

export function migrateExisting(): void {
  const projectRoot = process.cwd();
  const nanoclawDir = path.join(projectRoot, '.nanoclaw');

  // First, do a fresh init
  initNanoclawDir();

  // Then, diff current files against base to capture modifications
  const baseSrcDir = path.join(nanoclawDir, 'base', 'src');
  const srcDir = path.join(projectRoot, 'src');
  const customDir = path.join(nanoclawDir, 'custom');

  try {
    const diff = execSync(`diff -ruN "${baseSrcDir}" "${srcDir}" || true`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (diff.trim()) {
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'migration.patch'),
        diff,
        'utf-8',
      );
      console.log(
        'Custom modifications captured in .nanoclaw/custom/migration.patch',
      );
    } else {
      console.log('No custom modifications detected.');
    }
  } catch {
    console.log('Could not generate diff. Continuing with clean base.');
  }

  console.log('Migration complete. Skills system ready.');
}
