import { type AppConfig, parseConfig } from './app-config.js';

/** Loads `.env` (if present; real environment variables win) and validates it. */
export function loadConfig(): AppConfig {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env is optional; values may come from the real environment
  }
  return parseConfig(process.env);
}
