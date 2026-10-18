// Read-only survey of the PUBLIC learner API (GET only). No writes, no credentials.
const API = 'http://localhost:3001/api/v1';
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const get = async (p) => {
  const r = await fetch(API + p);
  return { status: r.status, etag: r.headers.get('etag'), cc: r.headers.get('cache-control'), body: r.status === 200 ? await r.json() : await r.json().catch(() => null) };
};
const out = { levels: {}, blockTypes: {}, variants: 0, titles: { int: 0, demo: 0, other: [] }, lessonsFetched: 0, withNavigation: 0 };
const seenCourses = new Map();
for (const level of LEVELS) {
  const list = await get(`/courses?level=${level}`);
  out.levels[level] = { status: list.status, courses: list.body.courses.length, etag: !!list.etag, cacheControl: list.cc };
  for (const c of list.body.courses) {
    seenCourses.set(c.courseId, c.title);
    if (c.title.startsWith('int-')) out.titles.int += 0; // counted below, once per course
  }
}
for (const [id, title] of seenCourses) {
  if (/^int-/.test(title)) out.titles.int += 1;
  else if (/^\[DEMO\]/.test(title)) out.titles.demo += 1;
  else out.titles.other.push(title);
}
out.uniqueCourses = seenCourses.size;
const lessonIds = new Set();
for (const level of LEVELS) {
  for (const id of seenCourses.keys()) {
    const c = await get(`/courses/${id}?level=${level}`);
    if (c.status !== 200) continue;
    for (const m of c.body.modules) for (const l of m.lessons) lessonIds.add(`${l.lessonId}|${level}`);
  }
}
for (const key of lessonIds) {
  const [id, level] = key.split('|');
  const l = await get(`/lessons/${id}?level=${level}`);
  if (l.status !== 200) continue;
  out.lessonsFetched += 1;
  for (const b of l.body.snapshot.blocks) {
    out.blockTypes[b.type] = (out.blockTypes[b.type] || 0) + 1;
    if (b.source === 'VARIANT') out.variants += 1;
  }
  const n = await get(`/lessons/${id}/navigation?level=${level}`);
  if (n.status === 200) out.withNavigation += 1;
}
// negative probes
const probes = {
  missingLevel: (await get('/courses')).status,
  badLevel: (await get('/courses?level=expert')).status,
  malformedLessonId: (await get('/lessons/not-a-uuid?level=BEGINNER')).status,
  unknownLessonId: (await get('/lessons/11111111-2222-4333-8444-555555555555?level=BEGINNER')).status,
};
out.probes = probes;
// conditional request
const first = [...lessonIds][0];
if (first) {
  const [id, level] = first.split('|');
  const a = await fetch(`${API}/lessons/${id}?level=${level}`);
  const tag = a.headers.get('etag');
  const b = await fetch(`${API}/lessons/${id}?level=${level}`, { headers: { 'If-None-Match': tag } });
  out.conditional = { firstStatus: a.status, etagPresent: !!tag, revalidateStatus: b.status };
}
console.log(JSON.stringify(out, null, 2));
