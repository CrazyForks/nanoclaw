import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { parse, stringify } from 'yaml';

import { AppliedSkill, SkillState } from './types.js';

const NANOCLAW_DIR = '.nanoclaw';
const STATE_FILE = 'state.yaml';
const CURRENT_VERSION = '0.1.0';

function getStatePath(): string {
  return path.join(process.cwd(), NANOCLAW_DIR, STATE_FILE);
}

export function readState(): SkillState {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) {
    throw new Error(
      '.nanoclaw/state.yaml not found. Run initSkillsSystem() first.',
    );
  }
  const content = fs.readFileSync(statePath, 'utf-8');
  const state = parse(content) as SkillState;

  if (state.skills_system_version > CURRENT_VERSION) {
    throw new Error(
      `state.yaml version ${state.skills_system_version} is newer than tooling version ${CURRENT_VERSION}. Update your skills engine.`,
    );
  }

  return state;
}

export function writeState(state: SkillState): void {
  const statePath = getStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const content = stringify(state, { sortMapEntries: true });
  fs.writeFileSync(statePath, content, 'utf-8');
}

export function recordSkillApplication(
  skillName: string,
  version: string,
  fileHashes: Record<string, string>,
  structuredOutcomes?: Record<string, unknown>,
): void {
  const state = readState();

  // Remove previous application of same skill if exists
  state.applied_skills = state.applied_skills.filter(
    (s) => s.name !== skillName,
  );

  state.applied_skills.push({
    name: skillName,
    version,
    applied_at: new Date().toISOString(),
    file_hashes: fileHashes,
    structured_outcomes: structuredOutcomes,
  });

  writeState(state);
}

export function getAppliedSkills(): AppliedSkill[] {
  const state = readState();
  return state.applied_skills;
}

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}
