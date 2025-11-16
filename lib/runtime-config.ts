type RuntimeConfig = {
  slackWebhookUrl: string | null;
  jicooSecret: string | null;
};

const state: RuntimeConfig = {
  slackWebhookUrl: null,
  jicooSecret: null,
};

export function getRuntimeConfig(): RuntimeConfig {
  return state;
}

export function setRuntimeConfig(partial: Partial<RuntimeConfig>) {
  state.slackWebhookUrl = partial.slackWebhookUrl ?? state.slackWebhookUrl;
  state.jicooSecret = partial.jicooSecret ?? state.jicooSecret;
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
