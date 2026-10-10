import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { NotFoundError } from '../../../shared-kernel/index.js';
import type { CourseModule } from '../domain/models.js';
import type { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CurriculumFacade } from './curriculum.facade.js';

const module = {
  id: randomUUID(),
  courseId: randomUUID(),
  title: 'secret internals',
  position: 3,
  version: 7,
} as CourseModule;

function facade(found: CourseModule | null) {
  const repo = {
    findById: async () => found,
    findByIdForUpdate: async () => found,
  } as unknown as CourseModuleRepository;
  return new CurriculumFacade(repo);
}

describe('CurriculumFacade', () => {
  it('exposes only the module id and its course', async () => {
    expect(await facade(module).findModule(module.id)).toEqual({
      id: module.id,
      courseId: module.courseId,
    });
    expect(
      await facade(module).lockModule(module.id, {} as EntityManager),
    ).toEqual({
      id: module.id,
      courseId: module.courseId,
    });
  });

  it('returns null for an unknown module, and throws NotFoundError when locking one', async () => {
    expect(await facade(null).findModule(randomUUID())).toBeNull();
    await expect(
      facade(null).lockModule(randomUUID(), {} as EntityManager),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
