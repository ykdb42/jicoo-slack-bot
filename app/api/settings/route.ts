import { NextRequest, NextResponse } from 'next/server';
import { getRuntimeConfig, maskUrl, setRuntimeConfig } from '@/lib/runtime-config';

type SettingsBody = {
  slackWebhookUrl?: string;
  jicooSecret?: string;
};

export async function GET() {
  const config = getRuntimeConfig();

  return NextResponse.json({
    slackWebhookUrl: maskUrl(config.slackWebhookUrl),
    hasSlackWebhookUrl: Boolean(config.slackWebhookUrl),
    hasJicooSecret: Boolean(config.jicooSecret),
  });
}

export async function POST(req: NextRequest) {
  let body: SettingsBody;
  try {
    body = await req.json();
  } catch (error) {
    console.warn('Invalid JSON in settings POST', error);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const slackWebhookUrl = sanitizeString(body.slackWebhookUrl);
  const jicooSecret = sanitizeString(body.jicooSecret);

  if (slackWebhookUrl && !isValidUrl(slackWebhookUrl)) {
    return NextResponse.json({ error: 'Invalid Slack webhook URL' }, { status: 400 });
  }

  setRuntimeConfig({
    slackWebhookUrl: slackWebhookUrl ?? null,
    jicooSecret: jicooSecret ?? null,
  });

  return NextResponse.json({
    ok: true,
    slackWebhookUrl: maskUrl(slackWebhookUrl ?? null),
    hasSlackWebhookUrl: Boolean(slackWebhookUrl),
    hasJicooSecret: Boolean(jicooSecret),
  });
}

function sanitizeString(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol === 'https:' || url.protocol === 'http:');
  } catch {
    return false;
  }
}
