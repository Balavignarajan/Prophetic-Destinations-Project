import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.ts') &&
      !/\.(spec|int-spec)\.ts$/.test(entry.name)
      ? [full]
      : [];
  });
}

const imports = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map(
    (m) => m[1],
  );

describe('Delivery module boundaries (Phase 4A)', () => {
  const files = sources(root);

  it('reaches other feature modules only through publishing/index.js', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of imports(file)) {
        const target = /modules\/([^/]+)/.exec(specifier.replaceAll('\\', '/'));
        const crossModule = specifier.startsWith('.') && target;
        if (crossModule && target[1] !== 'publishing') {
          offenders.push(`${file}: ${specifier}`);
        }
        if (
          crossModule &&
          target[1] === 'publishing' &&
          !specifier.endsWith('publishing/index.js')
        ) {
          offenders.push(`${file}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never touches authoring, curriculum or identity code, entities or repositories', () => {
    const forbidden =
      /(modules\/(lessons|curriculum|identity|scripture|media|quizzes)\b|\.entity\.js|\.repository\.js|typeorm|DataSource|EntityManager)/;
    const offenders = files.flatMap((file) =>
      imports(file)
        .filter((specifier) => forbidden.test(specifier.replaceAll('\\', '/')))
        .map((specifier) => `${resolve(file)}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('exposes only the approved read-only routes and nothing that writes', () => {
    const controllers = files.filter((f) => f.endsWith('.controller.ts'));
    const routes = controllers.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const base = /@Controller\('([^']*)'\)/.exec(text)![1];
      return [...text.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g)].map(
        (m) =>
          `${m[1].toUpperCase()} /${base}${m[2] ? `/${m[2].replaceAll("'", '')}` : ''}`,
      );
    });
    expect(routes.sort()).toEqual(
      [
        'GET /courses',
        'GET /courses/:courseId',
        'GET /lessons/:lessonId',
        'GET /lessons/:lessonId/navigation',
      ].sort(),
    );
  });

  it('keeps every controller anonymous and rate limited', () => {
    for (const file of files.filter((f) => f.endsWith('.controller.ts'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).toContain('@Public()');
      expect(text, file).toContain('@UseGuards(ThrottlerGuard)');
    }
  });
});
