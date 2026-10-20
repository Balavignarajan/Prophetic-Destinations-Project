import { Module } from '@nestjs/common';
import { ScriptureController } from './api/scripture.controller.js';
import { ScriptureDataService } from './application/scripture-data.service.js';
import { ScriptureFacade } from './application/scripture.facade.js';

/**
 * Scripture references: the supported books, parsing of `John 3:16` / `John 3:16-18`, and (when an APPROVED data file is
 * installed through SCRIPTURE_DATA_PATH) canonical verification and read-only lookup. No data set is approved or bundled
 * (see docs/scripture-source-research.md), so without that file passages are reported as unverifiable, never assumed valid.
 */
@Module({
  controllers: [ScriptureController],
  providers: [ScriptureDataService, ScriptureFacade],
  exports: [ScriptureFacade],
})
export class ScriptureModule {}
