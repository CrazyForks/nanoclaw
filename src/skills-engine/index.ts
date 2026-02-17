export { applySkill } from './apply.js';
export { clearBackup, createBackup, restoreBackup } from './backup.js';
export { initNanoclawDir } from './init.js';
export {
  checkConflicts,
  checkDependencies,
  readManifest,
} from './manifest.js';
export {
  cleanupMergeState,
  isGitRepo,
  mergeFile,
  runRerere,
  setupRerereAdapter,
} from './merge.js';
export { initSkillsSystem, migrateExisting } from './migrate.js';
export {
  computeFileHash,
  getAppliedSkills,
  readState,
  recordSkillApplication,
  writeState,
} from './state.js';
export {
  mergeEnvAdditions,
  mergeNpmDependencies,
  runNpmInstall,
} from './structured.js';
export type {
  AppliedSkill,
  ApplyResult,
  MergeResult,
  SkillManifest,
  SkillState,
} from './types.js';
