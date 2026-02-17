import fs from 'fs';
import os from 'os';
import path from 'path';

import { clearBackup, createBackup, restoreBackup } from './backup.js';
import { checkConflicts, checkDependencies, readManifest } from './manifest.js';
import {
  cleanupMergeState,
  isGitRepo,
  mergeFile,
  runRerere,
  setupRerereAdapter,
} from './merge.js';
import { computeFileHash, readState, recordSkillApplication } from './state.js';
import { mergeEnvAdditions, mergeNpmDependencies, runNpmInstall } from './structured.js';
import { ApplyResult } from './types.js';

const NANOCLAW_DIR = '.nanoclaw';

export async function applySkill(skillDir: string): Promise<ApplyResult> {
  const projectRoot = process.cwd();
  const manifest = readManifest(skillDir);

  // --- Pre-flight checks ---
  readState(); // Validates state exists and version is compatible

  const deps = checkDependencies(manifest);
  if (!deps.ok) {
    return {
      success: false,
      skill: manifest.skill,
      version: manifest.version,
      error: `Missing dependencies: ${deps.missing.join(', ')}`,
    };
  }

  const conflicts = checkConflicts(manifest);
  if (!conflicts.ok) {
    return {
      success: false,
      skill: manifest.skill,
      version: manifest.version,
      error: `Conflicting skills: ${conflicts.conflicting.join(', ')}`,
    };
  }

  // Detect drift for modified files
  const driftFiles: string[] = [];
  for (const relPath of manifest.modifies) {
    const currentPath = path.join(projectRoot, relPath);
    const basePath = path.join(projectRoot, NANOCLAW_DIR, 'base', relPath);

    if (fs.existsSync(currentPath) && fs.existsSync(basePath)) {
      const currentHash = computeFileHash(currentPath);
      const baseHash = computeFileHash(basePath);
      if (currentHash !== baseHash) {
        driftFiles.push(relPath);
      }
    }
  }

  if (driftFiles.length > 0) {
    console.log(`Drift detected in: ${driftFiles.join(', ')}`);
    console.log('Three-way merge will be used to reconcile changes.');
  }

  // --- Backup ---
  const filesToBackup = [
    ...manifest.modifies.map((f) => path.join(projectRoot, f)),
    ...manifest.adds.map((f) => path.join(projectRoot, f)),
    path.join(projectRoot, 'package.json'),
  ];
  createBackup(filesToBackup);

  try {
    // --- Copy new files from add/ ---
    const addDir = path.join(skillDir, 'add');
    if (fs.existsSync(addDir)) {
      copyDir(addDir, projectRoot);
    }

    // --- Merge modified files ---
    const mergeConflicts: string[] = [];

    for (const relPath of manifest.modifies) {
      const currentPath = path.join(projectRoot, relPath);
      const basePath = path.join(projectRoot, NANOCLAW_DIR, 'base', relPath);
      const skillPath = path.join(skillDir, 'modify', relPath);

      if (!fs.existsSync(skillPath)) {
        throw new Error(`Skill modified file not found: ${skillPath}`);
      }

      if (!fs.existsSync(currentPath)) {
        // File doesn't exist yet — just copy from skill
        fs.mkdirSync(path.dirname(currentPath), { recursive: true });
        fs.copyFileSync(skillPath, currentPath);
        continue;
      }

      if (!fs.existsSync(basePath)) {
        // No base — use current as base (first-time apply)
        fs.mkdirSync(path.dirname(basePath), { recursive: true });
        fs.copyFileSync(currentPath, basePath);
      }

      // Three-way merge: current ← base → skill
      // git merge-file modifies the first argument in-place, so use a temp copy
      const tmpCurrent = path.join(
        os.tmpdir(),
        `nanoclaw-merge-${Date.now()}-${path.basename(relPath)}`,
      );
      fs.copyFileSync(currentPath, tmpCurrent);

      const result = mergeFile(tmpCurrent, basePath, skillPath);

      if (result.clean) {
        fs.copyFileSync(tmpCurrent, currentPath);
        fs.unlinkSync(tmpCurrent);
      } else {
        // Conflict — try rerere
        const baseContent = fs.readFileSync(basePath, 'utf-8');
        const oursContent = fs.readFileSync(currentPath, 'utf-8');
        const theirsContent = fs.readFileSync(skillPath, 'utf-8');

        if (isGitRepo()) {
          setupRerereAdapter(relPath, baseContent, oursContent, theirsContent);
          const autoResolved = runRerere();
          cleanupMergeState();

          if (autoResolved) {
            fs.copyFileSync(tmpCurrent, currentPath);
            fs.unlinkSync(tmpCurrent);
            continue;
          }
        }

        // Unresolved conflict — copy merge result with conflict markers
        fs.copyFileSync(tmpCurrent, currentPath);
        fs.unlinkSync(tmpCurrent);
        mergeConflicts.push(relPath);
      }
    }

    if (mergeConflicts.length > 0) {
      return {
        success: false,
        skill: manifest.skill,
        version: manifest.version,
        mergeConflicts,
        error: `Merge conflicts in: ${mergeConflicts.join(', ')}. Resolve manually then run recordSkillApplication().`,
      };
    }

    // --- Structured operations ---
    if (manifest.structured?.npm_dependencies) {
      const pkgPath = path.join(projectRoot, 'package.json');
      mergeNpmDependencies(pkgPath, manifest.structured.npm_dependencies);
    }

    if (manifest.structured?.env_additions) {
      const envPath = path.join(projectRoot, '.env.example');
      mergeEnvAdditions(envPath, manifest.structured.env_additions);
    }

    // Run npm install if dependencies were added
    if (
      manifest.structured?.npm_dependencies &&
      Object.keys(manifest.structured.npm_dependencies).length > 0
    ) {
      runNpmInstall();
    }

    // --- Update state ---
    const fileHashes: Record<string, string> = {};
    for (const relPath of [...manifest.adds, ...manifest.modifies]) {
      const absPath = path.join(projectRoot, relPath);
      if (fs.existsSync(absPath)) {
        fileHashes[relPath] = computeFileHash(absPath);
      }
    }

    recordSkillApplication(
      manifest.skill,
      manifest.version,
      fileHashes,
      manifest.structured ? { ...manifest.structured } : undefined,
    );

    // Update base snapshots for modified files
    for (const relPath of manifest.modifies) {
      const currentPath = path.join(projectRoot, relPath);
      const basePath = path.join(projectRoot, NANOCLAW_DIR, 'base', relPath);
      if (fs.existsSync(currentPath)) {
        fs.mkdirSync(path.dirname(basePath), { recursive: true });
        fs.copyFileSync(currentPath, basePath);
      }
    }

    // --- Cleanup ---
    clearBackup();

    return {
      success: true,
      skill: manifest.skill,
      version: manifest.version,
    };
  } catch (err) {
    // Restore from backup on failure
    restoreBackup();
    clearBackup();
    throw err;
  }
}

function copyDir(src: string, dest: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
