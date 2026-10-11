// Public surface of the publishing module. Other modules import only from here.
export { PublishingModule } from './publishing.module.js';
export { PublishingFacade } from './application/publishing.facade.js';
export type { ActiveSnapshotInfo } from './domain/models.js';
export type {
  LessonNavigation,
  PublishedCourseView,
  PublishedLessonItem,
  PublishedLessonSummary,
  PublishedModuleView,
} from './domain/catalog-view.js';
