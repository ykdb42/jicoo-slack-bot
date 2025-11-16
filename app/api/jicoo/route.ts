import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getRuntimeConfig } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNATURE_HEADER = 'Jicoo-Webhook-Signature';
const SIGNATURE_TOLERANCE_SECONDS = 60 * 5;
const FALLBACK_TEXT = '不明';
const JST_TIMEZONE = 'Asia/Tokyo';
const PHONE_QUESTION_PATTERN = /(電話|phone|tel)/i;
const GOOGLE_MEET_QUESTION_PATTERN = /(google\s*meet|meet\s*url|google\s*hangout|オンライン.*URL|URL.*Google)/i;

type JicooAnswerContent = string | string[] | null | undefined;

type JicooContact = {
  name?: string;
  email?: string;
  phone?: string;
  timezone?: string;
};

type JicooAnswer = {
  question?: string;
  content?: JicooAnswerContent;
  value?: JicooAnswerContent;
};

type JicooMeetingLocation = {
  url?: string | null;
  link?: string | null;
  value?: string | null;
};

type JicooMeeting = {
  url?: string | null;
  link?: string | null;
};

type JicooEventPayload = {
  event: string;
  object?: {
    id?: string;
    startedAt?: string;
    endedAt?: string;
    eventTypeName?: string;
    eventTypeId?: string;
    contact?: JicooContact | null;
    answers?: JicooAnswer[] | null;
    googleMeetUrl?: string;
    hangoutLink?: string;
    hangoutUrl?: string;
    meetingUrl?: string;
    conferenceUrl?: string;
    meeting?: JicooMeeting | null;
    location?: JicooMeetingLocation | null;
  } | null;
  contact?: JicooContact | null;
  answers?: JicooAnswer[] | null;
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
  const answers = collectAnswers(payload);
  const { name, email, phone } = getContactInfo(payload, answers);
  const startText = toJstString(payload.object?.startedAt);
  const endText = toJstString(payload.object?.endedAt);
  const googleMeetUrl = extractGoogleMeetUrl(payload, answers);
  const heading = '新しい予約を受信しました';

  const text =
    `${heading}\n` +
    `・名前: ${name}\n` +
    `・メール: ${email}\n` +
    `・電話番号: ${phone}\n` +
    `・開始時刻: ${startText}\n` +
    `・終了時刻: ${endText}\n` +
    `・Google Meet: ${googleMeetUrl}`;

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
          text: `*名前*\n${name}`,
        },
        {
          type: 'mrkdwn',
          text: `*メール*\n${email}`,
        },
        {
          type: 'mrkdwn',
          text: `*電話番号*\n${phone}`,
        },
        {
          type: 'mrkdwn',
          text: `*開始時刻*\n${startText}`,
        },
        {
          type: 'mrkdwn',
          text: `*終了時刻*\n${endText}`,
        },
        {
          type: 'mrkdwn',
          text: `*Google Meet*\n${googleMeetUrl}`,
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
  if (!dateTime) {
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

function collectAnswers(payload: JicooEventPayload): JicooAnswer[] {
  const result: JicooAnswer[] = [];
  const bookingAnswers = payload.object?.answers;
  if (Array.isArray(bookingAnswers)) {
    result.push(...bookingAnswers);
  }
  const rootAnswers = payload.answers;
  if (Array.isArray(rootAnswers)) {
    result.push(...rootAnswers);
  }
  return result;
}

function getContactInfo(payload: JicooEventPayload, answers: JicooAnswer[]) {
  const contact = payload.object?.contact ?? payload.contact;
  const name = normalizeText(contact?.name) ?? FALLBACK_TEXT;
  const email = normalizeText(contact?.email) ?? FALLBACK_TEXT;
  const phone =
    normalizeText(contact?.phone) ?? findAnswerValue(answers, PHONE_QUESTION_PATTERN) ?? FALLBACK_TEXT;

  return { name, email, phone };
}

function extractGoogleMeetUrl(payload: JicooEventPayload, answers: JicooAnswer[]): string {
  const candidates = [
    payload.object?.googleMeetUrl,
    payload.object?.hangoutLink,
    payload.object?.hangoutUrl,
    payload.object?.conferenceUrl,
    payload.object?.meetingUrl,
    payload.object?.meeting?.url,
    payload.object?.meeting?.link,
    payload.object?.location?.url,
    payload.object?.location?.link,
    payload.object?.location?.value,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized && looksLikeUrl(normalized)) {
      return normalized;
    }
  }

  const answerUrl = findAnswerValue(answers, GOOGLE_MEET_QUESTION_PATTERN);
  if (answerUrl && looksLikeUrl(answerUrl)) {
    return answerUrl;
  }

  return FALLBACK_TEXT;
}

function findAnswerValue(answers: JicooAnswer[], pattern: RegExp): string | undefined {
  for (const answer of answers) {
    if (!answer.question || !pattern.test(answer.question)) {
      continue;
    }
    const normalized = normalizeAnswerValue(answer.content ?? answer.value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function normalizeAnswerValue(value: JicooAnswerContent): string | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    if (normalized.length === 0) {
      return undefined;
    }
    return normalized.join(', ');
  }
  return normalizeText(value);
}

function normalizeText(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
