import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getRuntimeConfig } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNATURE_HEADER = 'Jicoo-Webhook-Signature';
const SIGNATURE_TOLERANCE_SECONDS = 60 * 5;
const FALLBACK_TEXT = '不明';
const JST_TIMEZONE = 'Asia/Tokyo';

type JicooEventPayload = {
  event: string;
  object?: {
    id?: string;
    startedAt?: string;
    endedAt?: string;
    eventTypeName?: string;
    eventTypeId?: string;
  } | null;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    timezone?: string;
  } | null;
};

type SignatureParts = {
  timestamp: number;
  signature: string;
};

type SlackPayload = {
  text: string;
  blocks: Array<Record<string, unknown>>;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get(SIGNATURE_HEADER);
  if (!signatureHeader) {
    console.warn('Missing signature header');
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  const { jicooSecret: webhookSecret, slackWebhookUrl } = await getRuntimeConfig();
  if (!webhookSecret || !slackWebhookUrl) {
    console.error('Runtime config missing. Configure via UI before sending events.');
    return NextResponse.json(
      { error: 'Runtime config missing. Please configure from the dashboard UI.' },
      { status: 503 },
    );
  }

  const parsedSignature = parseSignature(signatureHeader);
  if (!parsedSignature) {
    console.warn('Invalid signature header format');
    return NextResponse.json({ error: 'Invalid signature header' }, { status: 400 });
  }

  if (!isFreshTimestamp(parsedSignature.timestamp)) {
    console.warn('Signature timestamp out of range');
    return NextResponse.json({ error: 'Stale signature' }, { status: 401 });
  }

  const isValidSignature = verifySignature(parsedSignature, rawBody, webhookSecret);
  if (!isValidSignature) {
    console.warn('Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: JicooEventPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error('Failed to parse payload', error);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (payload.event !== 'guest_booked') {
    // この分岐を拡張すると guest_rescheduled や guest_cancelled に柔軟に対応できる。
    console.info(`Ignoring unsupported event: ${payload.event}`);
    return NextResponse.json({ ok: true, ignoredEvent: payload.event });
  }

  const slackPayload = buildSlackPayload(payload);
  const slackResult = await sendSlackNotification(slackWebhookUrl, slackPayload);
  if (!slackResult.ok) {
    return NextResponse.json({ error: 'Failed to notify Slack' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

function parseSignature(header: string): SignatureParts | null {
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=').map((item) => item.trim());
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (!parts.t || !parts.v1) {
    return null;
  }

  const timestamp = Number(parts.t);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return {
    timestamp,
    signature: parts.v1,
  };
}

function isFreshTimestamp(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= SIGNATURE_TOLERANCE_SECONDS;
}

function verifySignature({ timestamp, signature }: SignatureParts, rawBody: string, secret: string): boolean {
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  let providedBuffer: Buffer;
  try {
    providedBuffer = Buffer.from(signature, 'hex');
  } catch (error) {
    console.warn('Invalid hex signature', error);
    return false;
  }

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function buildSlackPayload(payload: JicooEventPayload): SlackPayload {
  const contactName = payload.contact?.name ?? FALLBACK_TEXT;
  const contactEmail = payload.contact?.email ?? FALLBACK_TEXT;
  const start = payload.object?.startedAt ?? FALLBACK_TEXT;
  const end = payload.object?.endedAt ?? FALLBACK_TEXT;
  const eventName = payload.object?.eventTypeName ?? FALLBACK_TEXT;

  const startText = toJstString(start);
  const endText = toJstString(end);
  const heading = '📅 新規予約が入りました';

  const text =
    `${heading}\n` +
    `・名前: ${contactName}\n` +
    `・メール: ${contactEmail}\n` +
    `・開始: ${startText}\n` +
    `・終了: ${endText}\n` +
    `・イベント: ${eventName}`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: heading,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*名前*\n${contactName}`,
        },
        {
          type: 'mrkdwn',
          text: `*メール*\n${contactEmail}`,
        },
        {
          type: 'mrkdwn',
          text: `*開始*\n${startText}`,
        },
        {
          type: 'mrkdwn',
          text: `*終了*\n${endText}`,
        },
        {
          type: 'mrkdwn',
          text: `*イベント*\n${eventName}`,
        },
      ],
    },
  ];

  return {
    text,
    blocks,
  };
}

async function sendSlackNotification(webhookUrl: string, payload: SlackPayload) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error('Slack webhook responded with error', response.status, responseBody);
      return { ok: false as const };
    }

    return { ok: true as const };
  } catch (error) {
    console.error('Failed to send Slack message', error);
    return { ok: false as const };
  }
}

function toJstString(dateTime?: string): string {
  if (!dateTime || dateTime === FALLBACK_TEXT) {
    return FALLBACK_TEXT;
  }

  try {
    const date = new Date(dateTime);
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: JST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(date).replace(/\//g, '-');
  } catch (error) {
    console.warn('Failed to format date', error);
    return dateTime;
  }
}
