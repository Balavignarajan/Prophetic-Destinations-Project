import { Module } from '@nestjs/common';
import { ScriptureFacade } from './application/scripture.facade.js';

/**
 * Scripture references. Today: the supported books and the parsing of `John 3:16` / `John 3:16-18`. No Scripture
 * text or verse-count data is held (the source has not been approved), so existence of a passage is not checked.
 */
@Module({
  providers: [ScriptureFacade],
  exports: [ScriptureFacade],
})
export class ScriptureModule {}
