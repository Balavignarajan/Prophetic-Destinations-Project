// Read-only probe: run the backend's OWN global ValidationPipe (from backend/dist) on the exact JSON bodies the admin website sends.
// No server, no database, no network.
import { pathToFileURL } from 'node:url';

const root = 'E:/Freelance/Prophetic Destinations Project/backend/dist';
const imp = (p) => import(pathToFileURL(`${root}/${p}`).href);

await import(pathToFileURL('E:/Freelance/Prophetic Destinations Project/backend/node_modules/reflect-metadata/Reflect.js').href).catch(() => {});
const { createValidationPipe } = await imp('platform/pipes/validation.pipe.js');
const wf = await imp('modules/publishing/api/dto/workflow.dto.js');
const pipe = createValidationPipe();

async function probe(label, metatype, body) {
  try {
    const out = await pipe.transform(body, { type: 'body', metatype });
    console.log(`ACCEPTED  ${label}  body=${JSON.stringify(body)}`);
    return out;
  } catch (e) {
    const resp = typeof e.getResponse === 'function' ? e.getResponse() : { message: String(e) };
    console.log(`REJECTED  ${label}  body=${JSON.stringify(body)}\n          -> ${JSON.stringify(resp).slice(0, 300)}`);
  }
}

console.log('--- what the admin website sends for lesson workflow transitions (app/lessons/[lessonId]/page.tsx: body.version = lesson.version)');
await probe('TransitionDto (submit/approve/publish/unpublish) with admin payload', wf.TransitionDto, { version: 3 });
await probe('RequestChangesDto with admin payload', wf.RequestChangesDto, { version: 3, note: 'please fix' });
console.log('--- what the backend contract accepts');
await probe('TransitionDto with expectedContentRevision', wf.TransitionDto, { expectedContentRevision: 3 });
await probe('TransitionDto with empty body', wf.TransitionDto, {});
