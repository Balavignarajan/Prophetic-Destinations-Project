// Read-only: per-level block sets of published lessons (public API, GET only).
const API = 'http://localhost:3001/api/v1';
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const get = async (p) => { const r = await fetch(API + p); return r.status === 200 ? r.json() : null; };
const courses = new Map();
for (const lv of LEVELS) for (const c of (await get(`/courses?level=${lv}`)).courses) courses.set(c.courseId, c.title);
// lesson -> level -> ordered list of block texts
const lessons = new Map();
for (const [cid, title] of courses) {
  for (const lv of LEVELS) {
    const c = await get(`/courses/${cid}?level=${lv}`);
    if (!c) continue;
    for (const m of c.modules) for (const l of m.lessons) {
      const les = await get(`/lessons/${l.lessonId}?level=${lv}`);
      if (!les) continue;
      const texts = les.snapshot.blocks.map((b) => `${b.ordinal}:${b.source}:` + JSON.stringify(b.content).match(/"text":"([^"]*)"/)?.[1]);
      if (!lessons.has(l.lessonId)) lessons.set(l.lessonId, { title: l.title, course: title, levels: {} });
      lessons.get(l.lessonId).levels[lv] = texts;
    }
  }
}
let differ = 0, same = 0, multi = 0;
const examples = [];
for (const [id, v] of lessons) {
  const present = Object.keys(v.levels);
  if (present.length < 2) continue;
  multi += 1;
  const sets = present.map((l) => JSON.stringify(v.levels[l]));
  if (new Set(sets).size > 1) { differ += 1; if (examples.length < 3) examples.push({ course: v.course, lesson: v.title, levels: v.levels }); } else same += 1;
}
console.log(JSON.stringify({ lessonsSeen: lessons.size, lessonsPublishedAtMoreThanOneLevel: multi, levelBlockSetsDiffer: differ, identicalAcrossLevels: same, examples }, null, 1));
