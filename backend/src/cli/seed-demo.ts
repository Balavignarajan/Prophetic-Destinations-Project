/**
 * Creates a small, clearly synthetic demo course by calling the running API as an ADMIN: authoring, review,
 * approval and publishing, so the whole path (workflow, snapshots, catalog, navigation) is exercised the way a
 * real client would. It touches nothing but its own `[DEMO]` course, and it is safe to re-run: if the course
 * already exists it only reports where it stands.
 *
 *   npm run seed:demo
 *
 * Environment (read from the shell or .env by the caller):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD   an existing ADMIN account (see `npm run seed:admin`)
 *   DEMO_API_URL                            default http://localhost:3001/api/v1
 *
 * All text is synthetic filler. It is not Scripture and is labelled as such.
 */

const COURSE_TITLE = '[DEMO] Synthetic course for backend demonstration';
const BASE = (
  process.env.DEMO_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/$/, '');
const LEVELS = ['BEGINNER', 'INTERMEDIATE'];

interface Json {
  [key: string]: unknown;
}

let token = '';

async function call(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true,
): Promise<Json> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authenticated && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as Json) : {};
  if (!response.ok) {
    const reason = [parsed.code, parsed.message]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
    throw new Error(`${method} ${path} -> ${response.status} ${reason}`.trim());
  }
  return parsed;
}

const richText = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

const SYNTHETIC =
  'Synthetic demonstration text. This is placeholder content, not Scripture and not real teaching material.';

async function findDemoCourse(): Promise<Json | null> {
  for (let offset = 0; ; offset += 100) {
    const page = await call('GET', `/admin/courses?limit=100&offset=${offset}`);
    const items = page.items as Json[];
    const found = items.find((course) => course.title === COURSE_TITLE);
    if (found) return found;
    if (offset + 100 >= (page.total as number)) return null;
  }
}

async function approveAndPublishLesson(lessonId: string): Promise<void> {
  const base = `/admin/lessons/${lessonId}/workflow`;
  await call('POST', `${base}/submit`, {});
  await call('POST', `${base}/approve`, {});
  await call('POST', `${base}/publish`, {});
}

async function main(): Promise<number> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set.');
    return 1;
  }

  const session = await call(
    'POST',
    '/admin/auth/login',
    { email, password },
    false,
  );
  token = session.accessToken as string;

  const existing = await findDemoCourse();
  if (existing) {
    console.log(
      `The demo course already exists (${JSON.stringify(existing.id)}, status ${JSON.stringify(existing.status)}). Nothing changed.`,
    );
    return 0;
  }

  const course = await call('POST', '/admin/courses', {
    title: COURSE_TITLE,
    description:
      'Synthetic content created by `npm run seed:demo`. Safe to ignore or delete.',
  });
  const courseId = course.id as string;
  const lessonIds: string[] = [];

  const modules = [
    { title: '[DEMO] Module one', lessons: ['Lesson one', 'Lesson two'] },
    { title: '[DEMO] Module two', lessons: ['Lesson three'] },
  ];
  for (const spec of modules) {
    const module = await call('POST', `/admin/courses/${courseId}/modules`, {
      title: spec.title,
      description: 'Synthetic module.',
    });
    const moduleId = module.id as string;
    for (const name of spec.lessons) {
      const lesson = await call(
        'POST',
        `/admin/courses/${courseId}/modules/${moduleId}/lessons`,
        {
          title: `[DEMO] ${name}`,
          subtitle: 'Synthetic lesson',
          estimatedMinutes: 5,
          levels: LEVELS,
        },
      );
      const lessonId = lesson.id as string;
      await call('POST', `/admin/lessons/${lessonId}/blocks`, {
        type: 'RICH_TEXT',
        sharedContent: richText(`${name}. ${SYNTHETIC}`),
        levels: LEVELS,
      });
      await approveAndPublishLesson(lessonId);
      lessonIds.push(lessonId);
    }
    const moduleFlow = `/admin/courses/${courseId}/modules/${moduleId}/workflow`;
    await call('POST', `${moduleFlow}/submit`, {});
    await call('POST', `${moduleFlow}/approve`, {});
  }

  const courseFlow = `/admin/courses/${courseId}/workflow`;
  await call('POST', `${courseFlow}/submit`, {});
  await call('POST', `${courseFlow}/approve`, {});
  const published = await call('POST', `${courseFlow}/publish`, {});

  console.log(
    `Demo course ${courseId} published (catalog version ${JSON.stringify((published.publication as Json).version)}).`,
  );
  console.log(`  Catalog:    GET ${BASE}/courses?level=BEGINNER`);
  console.log(`  Course:     GET ${BASE}/courses/${courseId}?level=BEGINNER`);
  console.log(
    `  Lesson:     GET ${BASE}/lessons/${lessonIds[0]}?level=BEGINNER`,
  );
  console.log(
    `  Navigation: GET ${BASE}/lessons/${lessonIds[0]}/navigation?level=BEGINNER`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`Demo seeding failed: ${(error as Error).message}`);
    process.exit(1);
  },
);
