import fs from 'node:fs/promises';
import path from 'node:path';

type RuntimeConfig = {
  slackWebhookUrl: string | null;
  jicooSecret: string | null;
};

const DEFAULT_CONFIG: RuntimeConfig = {
  slackWebhookUrl: null,
  jicooSecret: null,
};

const STORAGE_DIR = path.join(process.cwd(), '.runtime');
const STORAGE_FILE = path.join(STORAGE_DIR, 'settings.json');

let cachedConfig: RuntimeConfig | null = null;
let loadPromise: Promise<RuntimeConfig> | null = null;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const file = await fs.readFile(STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(file) as Partial<RuntimeConfig>;
      cachedConfig = {
        slackWebhookUrl: typeof parsed.slackWebhookUrl === 'string' ? parsed.slackWebhookUrl : null,
        jicooSecret: typeof parsed.jicooSecret === 'string' ? parsed.jicooSecret : null,
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        console.warn('Failed to read runtime config file. Falling back to defaults.', error);
      }
      cachedConfig = { ...DEFAULT_CONFIG };
    }
    return cachedConfig;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export async function setRuntimeConfig(partial: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
  const current = await getRuntimeConfig();
  const updated: RuntimeConfig = {
    slackWebhookUrl:
      Object.prototype.hasOwnProperty.call(partial, 'slackWebhookUrl') &&
      partial.slackWebhookUrl !== undefined
        ? partial.slackWebhookUrl
        : current.slackWebhookUrl,
    jicooSecret:
      Object.prototype.hasOwnProperty.call(partial, 'jicooSecret') && partial.jicooSecret !== undefined
        ? partial.jicooSecret
        : current.jicooSecret,
  };

  cachedConfig = updated;
  await persistConfig(updated);

  return updated;
}

export function maskUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function persistConfig(config: RuntimeConfig) {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const payload = JSON.stringify(config, null, 2);
    await fs.writeFile(STORAGE_FILE, payload, 'utf8');
  } catch (error) {
    console.error('Failed to persist runtime config. Values stay in-memory only.', error);
  }
}
