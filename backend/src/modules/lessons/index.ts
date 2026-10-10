// Public surface of the lessons module. Other modules import only from here.
export { LessonsModule } from './lessons.module.js';
export {
  LessonsFacade,
  type AssembledLesson,
  type AssembledLessonFields,
  type AssembledLevel,
  type BlockProblem,
  type BlockProblemCode,
  type LessonWorkflowState,
} from './application/lessons.facade.js';

// The pure level-aware resolver and the plain data types it works with.
export {
  resolveLesson,
  type Content,
  type ContentSource,
  type Diagnostic,
  type DiagnosticCode,
  type Resolution,
  type ResolvedBlock,
} from './domain/level-resolution.js';
export type { ContentProblem } from './domain/blocks/rich-text.js';
