'use client';

import { FormEvent, useEffect, useState } from 'react';

type SettingsResponse = {
  slackWebhookUrl: string | null;
  hasSlackWebhookUrl: boolean;
  hasJicooSecret: boolean;
};

export default function HomePage() {
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [jicooSecret, setJicooSecret] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  const [status, setStatus] = useState<SettingsResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('設定情報の取得に失敗しました');
        }
        const data = (await response.json()) as SettingsResponse;
        setStatus(data);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '設定情報の取得に失敗しました');
        setMessageType('error');
      } finally {
        setLoadingStatus(false);
      }
    };
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setEndpointUrl(`${window.location.origin}/api/jicoo`);
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('設定を保存しています…');
    setMessageType('info');

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slackWebhookUrl,
          jicooSecret,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? '設定の保存に失敗しました');
      }

      setStatus({
        slackWebhookUrl: result.slackWebhookUrl ?? null,
        hasSlackWebhookUrl: Boolean(result.hasSlackWebhookUrl),
        hasJicooSecret: Boolean(result.hasJicooSecret),
      });
      setSlackWebhookUrl('');
      setJicooSecret('');
      setMessage('設定を保存しました。以降の Webhook はこの値で処理されます。');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定の保存に失敗しました');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor =
    messageType === 'error' ? '#f87171' : messageType === 'success' ? '#4ade80' : '#93c5fd';

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <span style={{ fontSize: '3rem' }}>⚡</span>
      <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Jicoo Slack Bot</h1>
      <p style={{ maxWidth: 560, lineHeight: 1.6 }}>
        このアプリは Jicoo Webhook を受け取り、署名検証後に Slack へ通知するための API だけで構成されたミニマム実装です。
        下記フォームで Slack Webhook URL と Jicoo Signing Secret を入力すると、その値で Bot が即時に動作します
        （値はサーバーメモリに保存されるだけなので、再起動時は再設定が必要です）。
      </p>
      <code
        style={{
          padding: '0.75rem 1rem',
          borderRadius: '0.75rem',
          backgroundColor: '#1e293b',
          fontSize: '0.95rem',
        }}
      >
        POST /api/jicoo
      </code>

      <section
        style={{
          width: '100%',
          maxWidth: 540,
          backgroundColor: '#1e293b',
          padding: '1.5rem',
          borderRadius: '1rem',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            fontSize: '0.95rem',
            backgroundColor: '#0f172a',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
          }}
        >
          <strong style={{ fontSize: '1rem' }}>現在の設定</strong>
          {loadingStatus ? (
            <span>読み込み中…</span>
          ) : (
            <>
              <span>Slack Webhook: {status?.slackWebhookUrl ?? '未設定'}</span>
              <span>Jicoo Secret: {status?.hasJicooSecret ? '登録済み' : '未登録'}</span>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            fontSize: '0.95rem',
            backgroundColor: '#0f172a',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
          }}
        >
          <strong style={{ fontSize: '1rem' }}>Jicoo Webhook URL</strong>
          <p style={{ margin: 0, color: '#cbd5f5', lineHeight: 1.4 }}>
            Jicoo 管理画面の Webhook 設定には以下の URL を登録してください。
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <code
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                overflowX: 'auto',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: '#1e293b',
              }}
            >
              {endpointUrl || 'https://{your-domain}/api/jicoo'}
            </code>
            <button
              type="button"
              onClick={async () => {
                if (!endpointUrl) return;
                try {
                  await navigator.clipboard.writeText(endpointUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setMessage('クリップボードへのコピーに失敗しました');
                  setMessageType('error');
                }
              }}
              style={{
                border: '1px solid #38bdf8',
                background: '#0f172a',
                color: '#38bdf8',
                borderRadius: '999px',
                padding: '0.4rem 0.9rem',
                cursor: endpointUrl ? 'pointer' : 'not-allowed',
              }}
            >
              {copied ? 'コピーしました！' : 'コピー'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
            Slack Webhook URL
            <input
              type="url"
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
            Jicoo Signing Secret
            <input
              type="text"
              value={jicooSecret}
              onChange={(e) => setJicooSecret(e.target.value)}
              placeholder="whsec_xxxxxxxxx"
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: '0.5rem',
              border: 'none',
              borderRadius: '999px',
              padding: '0.75rem 1rem',
              background: submitting ? '#94a3b8' : '#38bdf8',
              color: '#0f172a',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            {submitting ? '保存中…' : '設定を保存'}
          </button>
        </form>

        {message && (
          <p style={{ margin: 0, fontSize: '0.95rem', color: statusColor }}>
            {message}
            <br />
            <small>※ 値はサーバーメモリに保持されるため、再デプロイ時などは再設定が必要です。</small>
          </p>
        )}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '0.5rem',
  border: '1px solid #334155',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  padding: '0.75rem',
  fontSize: '0.95rem',
};
