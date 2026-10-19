// Run with: npm test  (Node's built-in test runner, no extra dependency)
// Structural check of the route files (Expo Router builds the navigation from the file tree). It cannot replace running the app;
// the app itself was exercised separately (see the phase report).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const app = join(import.meta.dirname, '..', 'app');
const read = (file: string) => readFileSync(join(app, file), 'utf8');

describe('primary navigation: Home, Learn, Progress, More', () => {
  it('the tabs group has a screen for each area', () => {
    for (const file of ['index.tsx', 'learn.tsx', 'progress.tsx', 'more.tsx']) assert.ok(existsSync(join(app, '(tabs)', file)), `(tabs)/${file}`);
  });
  it('the tab bar lists exactly those four, in order, with their labels', () => {
    const layout = read('(tabs)/_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen name="([a-z]+)" options=\{\{ title: '([A-Za-z]+)'/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(names, ['index:Home', 'learn:Learn', 'progress:Progress', 'more:More']);
  });
  it('first launch goes through the welcome screen once, then to Home', () => {
    assert.ok(existsSync(join(app, 'welcome.tsx')));
    assert.ok(!existsSync(join(app, 'index.tsx')), 'the root index would collide with the Home tab');
    assert.match(read('(tabs)/_layout.tsx'), /Redirect href="\/welcome"/);
  });
  it('About, Privacy and Terms are reachable screens', () => {
    for (const kind of ['about', 'privacy', 'terms']) assert.match(read(`${kind}.tsx`), new RegExp(`DocumentScreen kind="${kind}"`));
  });
  it('existing screens are still present', () => {
    for (const file of ['saved.tsx', 'settings.tsx', 'course/[courseId].tsx', 'lesson/[lessonId].tsx', 'daniel-2.tsx', 'daniel-2-lesson.tsx']) {
      assert.ok(existsSync(join(app, file)), file);
    }
  });
  it('no test or helper file sits inside src/app (it would become a route)', () => {
    const stray = readdirSync(app, { recursive: true, encoding: 'utf8' }).filter((f) => /\.test\.|\.spec\./.test(f));
    assert.deepEqual(stray, []);
  });
});

describe('More menu', () => {
  const more = readFileSync(join(import.meta.dirname, '..', 'screens', 'more-screen.tsx'), 'utf8');
  it('offers level, invite, about, settings, privacy and terms', () => {
    for (const text of ['Learning level', 'Invite a Friend', 'title="About"', 'title="Settings"', 'Privacy Policy', 'title="Terms"']) assert.ok(more.includes(text), text);
  });
  it('invites through the native share sheet and reads no contacts', () => {
    assert.ok(more.includes('Share.share'));
    assert.ok(!/contacts/i.test(more.replace(/never sees or stores contacts/i, '')));
  });
});
