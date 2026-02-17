import fs from 'fs';
import path from 'path';

import { parse } from 'yaml';

import { getAppliedSkills } from './state.js';
import { SkillManifest } from './types.js';

export function readManifest(skillDir: string): SkillManifest {
  const manifestPath = path.join(skillDir, 'manifest.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const content = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = parse(content) as SkillManifest;

  // Validate required fields
  const required = [
    'skill',
    'version',
    'core_version',
    'adds',
    'modifies',
  ] as const;
  for (const field of required) {
    if (manifest[field] === undefined) {
      throw new Error(`Manifest missing required field: ${field}`);
    }
  }

  // Defaults
  manifest.conflicts = manifest.conflicts || [];
  manifest.depends = manifest.depends || [];

  return manifest;
}

export function checkDependencies(manifest: SkillManifest): {
  ok: boolean;
  missing: string[];
} {
  const applied = getAppliedSkills();
  const appliedNames = new Set(applied.map((s) => s.name));
  const missing = manifest.depends.filter((dep) => !appliedNames.has(dep));
  return { ok: missing.length === 0, missing };
}

export function checkConflicts(manifest: SkillManifest): {
  ok: boolean;
  conflicting: string[];
} {
  const applied = getAppliedSkills();
  const appliedNames = new Set(applied.map((s) => s.name));
  const conflicting = manifest.conflicts.filter((c) => appliedNames.has(c));
  return { ok: conflicting.length === 0, conflicting };
}
