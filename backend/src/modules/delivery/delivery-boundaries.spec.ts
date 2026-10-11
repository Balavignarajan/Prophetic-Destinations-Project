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

  it('exposes exactly one controller route: GET lessons/:lessonId', () => {
    const controllers = files.filter((f) => f.endsWith('.controller.ts'));
    expect(controllers).toHaveLength(1);
    const text = readFileSync(controllers[0], 'utf8');
    expect(text.match(/@(Get|Post|Put|Patch|Delete)\(/g)).toEqual(['@Get(']);
    expect(text).toContain("@Controller('lessons')");
    expect(text).toContain("@Get(':lessonId')");
  });
});
