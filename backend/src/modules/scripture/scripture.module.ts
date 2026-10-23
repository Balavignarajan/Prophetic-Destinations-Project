import { Module } from '@nestjs/common';
import { ScriptureController } from './api/scripture.controller.js';
import { ScriptureDataService } from './application/scripture-data.service.js';
import { ScriptureFacade } from './application/scripture.facade.js';

/**
 * Scripture references: the supported books, parsing of `John 3:16` / `John 3:16-18`, and (when a data file is installed through
 * SCRIPTURE_DATA_PATH) canonical verification and read-only lookup. The installed file is a community-maintained transcription that is
 * NOT approved for release (see docs/scripture-source-research.md); without a valid file passages are reported as unverifiable, never assumed valid.
 */
@Module({
  controllers: [ScriptureController],
  providers: [ScriptureDataService, ScriptureFacade],
  exports: [ScriptureFacade],
})
export class ScriptureModule {}
