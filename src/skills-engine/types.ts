export interface SkillManifest {
  skill: string;
  version: string;
  description: string;
  core_version: string;
  adds: string[];
  modifies: string[];
  structured?: {
    npm_dependencies?: Record<string, string>;
    env_additions?: string[];
  };
  conflicts: string[];
  depends: string[];
  test?: string;
}

export interface SkillState {
  skills_system_version: string;
  core_version: string;
  applied_skills: AppliedSkill[];
}

export interface AppliedSkill {
  name: string;
  version: string;
  applied_at: string;
  file_hashes: Record<string, string>;
  structured_outcomes?: Record<string, unknown>;
}

export interface ApplyResult {
  success: boolean;
  skill: string;
  version: string;
  mergeConflicts?: string[];
  error?: string;
}

export interface MergeResult {
  clean: boolean;
  exitCode: number;
}
