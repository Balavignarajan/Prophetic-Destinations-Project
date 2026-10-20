import { Inject, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { APP_CONFIG, type AppConfig } from '../../../config/index.js';
import { type ScriptureDataset, parseDataset } from '../domain/dataset.js';

export type ScriptureDataStatus =
  | { available: true; metadata: ScriptureDataset['metadata'] }
  | { available: false; reason: 'NOT_CONFIGURED' | 'UNREADABLE' | 'INVALID'; message: string; problems?: string[] };

/**
 * Loads the approved Scripture data set ONCE (lazily) from the file named by SCRIPTURE_DATA_PATH. Read-only: nothing in the API can
 * change it, and the file is never written. With no file, or a file that fails the contract, the status says exactly why and every
 * Scripture lookup answers "unavailable"; nothing is guessed or substituted. A broken file is never partly used.
 */
@Injectable()
export class ScriptureDataService {
  private readonly logger = new Logger(ScriptureDataService.name);
  private loading: Promise<void> | null = null;
  private dataset: ScriptureDataset | null = null;
  private current: ScriptureDataStatus = {
    available: false,
    reason: 'NOT_CONFIGURED',
    message: 'No Scripture data set is installed on the server. Reference syntax can be checked, but passages cannot be verified or shown.',
  };

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** The loaded data set, or null (see `status()` for why). */
  async get(): Promise<ScriptureDataset | null> {
    await this.load();
    return this.dataset;
  }

  async status(): Promise<ScriptureDataStatus> {
    await this.load();
    return this.current;
  }

  private load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  private async read(): Promise<void> {
    const path = this.config.scriptureDataPath;
    if (!path) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      this.logger.error('The Scripture data file could not be read or is not valid JSON');
      this.current = { available: false, reason: 'UNREADABLE', message: 'The Scripture data file could not be read. Ask an administrator to check the server configuration.' };
      return;
    }
    const parsed = parseDataset(raw);
    if (!parsed.ok) {
      this.logger.error(`The Scripture data file does not meet the data contract (${parsed.problems.length} problem(s))`);
      this.current = {
        available: false,
        reason: 'INVALID',
        message: 'The Scripture data file does not meet the required format, so it is not used.',
        problems: parsed.problems,
      };
      return;
    }
    this.dataset = parsed.dataset;
    this.current = { available: true, metadata: parsed.dataset.metadata };
  }
}
