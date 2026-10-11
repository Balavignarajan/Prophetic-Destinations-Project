// Public surface of the curriculum module. Other modules import only from here.
export { CurriculumModule } from './curriculum.module.js';
export {
  CurriculumFacade,
  type CourseWorkflowRef,
  type ModuleRef,
  type ModuleWorkflowRef,
} from './application/curriculum.facade.js';
