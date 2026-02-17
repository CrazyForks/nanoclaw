import { execSync } from 'child_process';
import fs from 'fs';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export function mergeNpmDependencies(
  packageJsonPath: string,
  newDeps: Record<string, string>,
): void {
  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  const pkg: PackageJson = JSON.parse(content);

  pkg.dependencies = pkg.dependencies || {};

  for (const [name, version] of Object.entries(newDeps)) {
    const existing = pkg.dependencies[name];
    if (existing && existing !== version) {
      throw new Error(
        `Dependency conflict: ${name} is already at ${existing}, skill wants ${version}`,
      );
    }
    pkg.dependencies[name] = version;
  }

  // Sort dependencies for deterministic output
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(pkg, null, 2) + '\n',
    'utf-8',
  );
}

export function mergeEnvAdditions(
  envExamplePath: string,
  additions: string[],
): void {
  let content = '';
  if (fs.existsSync(envExamplePath)) {
    content = fs.readFileSync(envExamplePath, 'utf-8');
  }

  const existingVars = new Set<string>();
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) existingVars.add(match[1]);
  }

  const newVars = additions.filter((v) => !existingVars.has(v));
  if (newVars.length === 0) return;

  if (content && !content.endsWith('\n')) content += '\n';
  content += '\n# Added by skill\n';
  for (const v of newVars) {
    content += `${v}=\n`;
  }

  fs.writeFileSync(envExamplePath, content, 'utf-8');
}

export function runNpmInstall(): void {
  execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
}
