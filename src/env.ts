import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;

/**
 * Resolve the .env file path (local only).
 * On Railway, env vars come from the service config — no .env file needed.
 */
function envFilePath(): string {
  return path.join(process.cwd(), '.env');
}

/**
 * Read values for the requested keys.
 *
 * On Railway: reads exclusively from process.env (service config is the source of truth).
 * Locally: parses the .env file first, then falls back to process.env.
 *
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  // On Railway, skip .env entirely — all config comes from service env vars
  if (!IS_RAILWAY) {
    const envFile = envFilePath();
    let content: string;
    try {
      content = fs.readFileSync(envFile, 'utf-8');
    } catch (err) {
      logger.debug({ err }, '.env file not found, falling back to process.env');
      content = '';
    }

    const wanted = new Set(keys);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!wanted.has(key)) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) result[key] = value;
    }
  }

  // Fall back to process.env for keys not found in .env (or always on Railway)
  for (const key of keys) {
    if (!result[key] && process.env[key]) {
      result[key] = process.env[key]!;
    }
  }

  return result;
}
