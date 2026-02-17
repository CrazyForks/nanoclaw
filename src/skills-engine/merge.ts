import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { MergeResult } from './types.js';

export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run git merge-file to three-way merge files.
 * Modifies currentPath in-place.
 * Returns { clean: true, exitCode: 0 } on clean merge,
 * { clean: false, exitCode: N } on conflict (N = number of conflicts).
 */
export function mergeFile(
  currentPath: string,
  basePath: string,
  skillPath: string,
): MergeResult {
  try {
    execSync(`git merge-file "${currentPath}" "${basePath}" "${skillPath}"`, {
      stdio: 'pipe',
    });
    return { clean: true, exitCode: 0 };
  } catch (err: any) {
    const exitCode = err.status ?? 1;
    if (exitCode > 0) {
      // Positive exit code = number of conflicts
      return { clean: false, exitCode };
    }
    // Negative exit code = error
    throw new Error(`git merge-file failed: ${err.message}`);
  }
}

/**
 * Set up unmerged index entries for rerere adapter.
 * Creates stages 1/2/3 so git rerere can record/resolve conflicts.
 */
export function setupRerereAdapter(
  filePath: string,
  baseContent: string,
  oursContent: string,
  theirsContent: string,
): void {
  if (!isGitRepo()) return;

  // Hash objects into git object store
  const baseHash = execSync('git hash-object -w --stdin', {
    input: baseContent,
    encoding: 'utf-8',
  }).trim();
  const oursHash = execSync('git hash-object -w --stdin', {
    input: oursContent,
    encoding: 'utf-8',
  }).trim();
  const theirsHash = execSync('git hash-object -w --stdin', {
    input: theirsContent,
    encoding: 'utf-8',
  }).trim();

  // Create unmerged index entries (stages 1/2/3)
  const indexInfo = [
    `100644 ${baseHash} 1\t${filePath}`,
    `100644 ${oursHash} 2\t${filePath}`,
    `100644 ${theirsHash} 3\t${filePath}`,
  ].join('\n');

  execSync('git update-index --index-info', {
    input: indexInfo,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Set MERGE_HEAD and MERGE_MSG (required for rerere)
  const gitDir = execSync('git rev-parse --git-dir', {
    encoding: 'utf-8',
  }).trim();
  const headHash = execSync('git rev-parse HEAD', {
    encoding: 'utf-8',
  }).trim();
  fs.writeFileSync(path.join(gitDir, 'MERGE_HEAD'), headHash + '\n');
  fs.writeFileSync(
    path.join(gitDir, 'MERGE_MSG'),
    `Skill merge: ${filePath}\n`,
  );
}

/**
 * Run git rerere to record or auto-resolve conflicts.
 * Returns true if rerere auto-resolved the conflict.
 */
export function runRerere(): boolean {
  if (!isGitRepo()) return false;

  try {
    execSync('git rerere', { stdio: 'pipe' });
    // Check if there are still unmerged entries
    const status = execSync('git diff --name-only --diff-filter=U', {
      encoding: 'utf-8',
    }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

/**
 * Clean up merge state after rerere operations.
 */
export function cleanupMergeState(): void {
  if (!isGitRepo()) return;

  const gitDir = execSync('git rev-parse --git-dir', {
    encoding: 'utf-8',
  }).trim();

  // Remove merge markers
  const mergeHead = path.join(gitDir, 'MERGE_HEAD');
  const mergeMsg = path.join(gitDir, 'MERGE_MSG');
  if (fs.existsSync(mergeHead)) fs.unlinkSync(mergeHead);
  if (fs.existsSync(mergeMsg)) fs.unlinkSync(mergeMsg);

  // Reset index
  try {
    execSync('git reset', { stdio: 'pipe' });
  } catch {
    // May fail if nothing staged
  }
}
