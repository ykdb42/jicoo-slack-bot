type EnvConfig = {
  slackWebhookUrl: string | null;
  jicooSecret: string | null;
};

type EnvStatus = {
  hasSlackWebhookUrl: boolean;
  hasJicooSecret: boolean;
};

export function getEnvConfig(): EnvConfig {
  return {
    slackWebhookUrl: readEnv(process.env.SLACK_WEBHOOK_URL),
    jicooSecret: readEnv(process.env.JICOO_SIGNING_SECRET),
  };
}

export function getEnvStatus(): EnvStatus {
  const config = getEnvConfig();
  return {
    hasSlackWebhookUrl: Boolean(config.slackWebhookUrl),
    hasJicooSecret: Boolean(config.jicooSecret),
  };
}

function readEnv(value?: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
