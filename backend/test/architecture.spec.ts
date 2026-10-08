import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Enforces the module boundaries from docs/architecture.md.
 * If a rule here fails, fix the import, not the test: changing the allowed
 * dependencies is an architecture decision.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MODULES_DIR = join(SRC, 'modules');

/** module -> modules it may import (through their index.ts only). */
const ALLOWED: Record<string, string[]> = {
  health: [],
  identity: [],
  curriculum: ['identity'],
  scripture: ['identity'],
  media: ['identity'],
  quizzes: ['identity'],
  lessons: ['identity', 'curriculum', 'scripture', 'media', 'quizzes'],
  publishing: ['identity', 'lessons', 'curriculum'],
  delivery: ['publishing'],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

function relativeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found = [...text.matchAll(/(?:from|import)\s*\(?\s*'(\.[^']*)'/g)];
  return found.map((match) => resolve(dirname(file), match[1]));
}

function moduleOf(file: string): string | undefined {
  const rel = relative(MODULES_DIR, file);
  return rel.startsWith('..') ? undefined : rel.split(sep)[0];
}

const files = sourceFiles(SRC);

describe('module boundaries', () => {
  it('declares a rule for every module folder', () => {
    const folders = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders).toEqual(Object.keys(ALLOWED).sort());
  });

  it('modules import other modules only through their index.ts and only as allowed', () => {
    const violations: string[] = [];

    for (const file of files) {
      const owner = moduleOf(file);
      if (!owner) continue;

      for (const target of relativeImports(file)) {
        const targetModule = moduleOf(target);
        if (!targetModule || targetModule === owner) continue;

        const label = `${relative(SRC, file)} -> ${relative(SRC, target)}`;
        if (!ALLOWED[owner]?.includes(targetModule)) {
          violations.push(
            `${label} (${owner} may not depend on ${targetModule})`,
          );
        } else if (
          !/^index(\.js)?$/.test(
            relative(join(MODULES_DIR, targetModule), target),
          )
        ) {
          violations.push(
            `${label} (import ${targetModule} through its index.ts)`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('has no dependency cycles between modules', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();

    const visit = (name: string, path: string[]) => {
      if (done.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Dependency cycle: ${[...path, name].join(' -> ')}`);
      }
      visiting.add(name);
      for (const dep of ALLOWED[name]) visit(dep, [...path, name]);
      visiting.delete(name);
      done.add(name);
    };

    expect(() =>
      Object.keys(ALLOWED).forEach((name) => visit(name, [])),
    ).not.toThrow();
  });

  it('keeps shared-kernel free of other project code', () => {
    const kernel = join(SRC, 'shared-kernel');
    const offenders = files
      .filter((file) => !relative(kernel, file).startsWith('..'))
      .filter((file) =>
        relativeImports(file).some((target) =>
          relative(kernel, target).startsWith('..'),
        ),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('keeps platform and shared-kernel independent of feature modules', () => {
    const offenders = files
      .filter((file) =>
        /^(platform|shared-kernel|config|database)$/.test(
          relative(SRC, file).split(sep)[0],
        ),
      )
      .filter((file) =>
        relativeImports(file).some((target) => moduleOf(target)),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
