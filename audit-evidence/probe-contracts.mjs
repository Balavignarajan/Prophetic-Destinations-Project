// Read-only: run the backend's own global ValidationPipe (backend/dist) over the exact bodies each admin-website screen sends.
// Source of each body: admin-website/app/**/page.tsx and lib/auth.tsx. No server, no database, no network.
import { pathToFileURL } from 'node:url';

const root = 'E:/Freelance/Prophetic Destinations Project/backend/dist';
const imp = (p) => import(pathToFileURL(`${root}/${p}`).href);
await import(pathToFileURL('E:/Freelance/Prophetic Destinations Project/backend/node_modules/reflect-metadata/Reflect.js').href).catch(() => {});

const { createValidationPipe } = await imp('platform/pipes/validation.pipe.js');
const course = await imp('modules/curriculum/api/dto/course.dto.js');
const mod = await imp('modules/curriculum/api/dto/module.dto.js');
const lesson = await imp('modules/lessons/api/dto/lesson.dto.js');
const block = await imp('modules/lessons/api/dto/block.dto.js');
const wf = await imp('modules/publishing/api/dto/workflow.dto.js');
const cat = await imp('modules/publishing/api/dto/catalog.dto.js');
const quiz = await imp('modules/quizzes/api/dto/quiz.dto.js');
const acct = await imp('modules/identity/api/dto/account.dto.js');
const login = await imp('modules/identity/api/dto/login.dto.js');
const pw = await imp('modules/identity/api/dto/change-password.dto.js');
const pipe = createValidationPipe();

const rows = [];
async function probe(area, label, metatype, body) {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    rows.push(['ACCEPTED', area, label, '']);
  } catch (e) {
    const r = typeof e.getResponse === 'function' ? e.getResponse() : { message: String(e) };
    const d = (r.details ?? []).map((x) => `${x.field}: ${x.messages.join('; ')}`).join(' | ') || r.message;
    rows.push(['REJECTED', area, label, d]);
  }
}

const doc = { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } };

// ---- curriculum
await probe('course', 'create {title, description:null}', course.CreateCourseDto, { title: 'T', description: null });
await probe('course', 'update {title, description:null, version}', course.UpdateCourseDto, { title: 'T', description: null, version: 1 });
await probe('module', 'create {title, description:null}', mod.CreateModuleDto, { title: 'T', description: null });
await probe('module', 'update {title, description:null, version}', mod.UpdateModuleDto, { title: 'T', description: null, version: 1 });
await probe('module', 'reorder {moduleIds}', mod.ReorderModulesDto, { moduleIds: ['5a0b3f0e-3b4a-4a5e-8d2c-0c9a1d3e4f50'] });
// ---- lessons
await probe('lesson', 'create {title, shortTitle, subtitle, introduction, estimatedMinutes, levels}', lesson.CreateLessonDto, { title: 'T', levels: ['BEGINNER'] });
await probe('lesson', 'update {..., null fields, version}', lesson.UpdateLessonDto, { title: 'T', shortTitle: null, subtitle: null, introduction: null, estimatedMinutes: null, version: 1 });
await probe('lesson', 'levels {levels, version}', lesson.SetLessonLevelsDto, { levels: ['BEGINNER'], version: 1 });
await probe('lesson', 'reorder {lessonIds}', lesson.ReorderLessonsDto, { lessonIds: ['5a0b3f0e-3b4a-4a5e-8d2c-0c9a1d3e4f50'] });
// ---- blocks
await probe('block', 'create {type:RICH_TEXT, sharedContent, levels}', block.CreateBlockDto, { type: 'RICH_TEXT', sharedContent: doc, levels: ['BEGINNER'] });
await probe('block', 'update {sharedContent, version}', block.UpdateBlockDto, { sharedContent: doc, version: 1 });
await probe('block', 'reorder {blockIds}', block.ReorderBlocksDto, { blockIds: ['5a0b3f0e-3b4a-4a5e-8d2c-0c9a1d3e4f50'] });
await probe('block', 'put level (variant) {content, version}', block.PutBlockLevelDto, { content: doc, version: 1 });
await probe('block', 'put level (visible, shared) {content:null, version}', block.PutBlockLevelDto, { content: null, version: 1 });
// ---- lesson workflow (admin sends body.version)
await probe('lesson workflow', 'submit/approve/publish/unpublish {version}', wf.TransitionDto, { version: 3 });
await probe('lesson workflow', 'request-changes {version, note}', wf.RequestChangesDto, { version: 3, note: 'n' });
// ---- course/module workflow (admin sends body.version)
await probe('course/module workflow', 'submit/approve/publish/unpublish {version}', cat.CatalogTransitionDto, { version: 3 });
await probe('course/module workflow', 'request-changes {version, note}', cat.CatalogRequestChangesDto, { version: 3, note: 'n' });
await probe('course/module workflow', 'control: {expectedVersion}', cat.CatalogTransitionDto, { expectedVersion: 3 });
// ---- quizzes
const q = { prompt: 'p', explanation: null, options: [{ text: 'a', correct: true }, { text: 'b', correct: false }] };
await probe('quiz', 'create {title, description:null, questions[explanation:null]}', quiz.CreateQuizDto, { title: 'T', description: null, questions: [q] });
await probe('quiz', 'update {title, description, version, questions}', quiz.UpdateQuizDto, { title: 'T', description: null, version: 1, questions: [q] });
// ---- accounts / auth
await probe('accounts', 'create {email, role, temporaryPassword}', acct.CreateAccountDto, { email: 'a@b.co', role: 'EDITOR', temporaryPassword: 'a-long-temp-Password-1' });
await probe('accounts', 'role {role}', acct.ChangeRoleDto, { role: 'EDITOR' });
await probe('accounts', 'password-reset {temporaryPassword}', acct.PasswordResetDto, { temporaryPassword: 'a-long-temp-Password-1' });
await probe('auth', 'login {email, password}', login.LoginDto, { email: 'a@b.co', password: 'x' });
await probe('auth', 'change password {currentPassword, newPassword}', pw.ChangePasswordDto, { currentPassword: 'x', newPassword: 'a-long-new-Password-1' });

const w = Math.max(...rows.map((r) => r[1].length));
for (const [res, area, label, detail] of rows) console.log(`${res.padEnd(8)} ${area.padEnd(w)}  ${label}${detail ? `\n         -> ${detail}` : ''}`);
console.log(`\n${rows.filter((r) => r[0] === 'ACCEPTED').length} accepted, ${rows.filter((r) => r[0] === 'REJECTED').length} rejected of ${rows.length}`);
