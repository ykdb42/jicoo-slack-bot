import type { CSSProperties } from 'react';
import { headers } from 'next/headers';
import { getEnvStatus } from '@/lib/env';

const FALLBACK_ENDPOINT = 'https://{your-domain}/api/jicoo';

export default async function HomePage() {
  const status = getEnvStatus();
  const endpointUrl = await resolveEndpointUrl();
  const displayEndpoint = endpointUrl ?? FALLBACK_ENDPOINT;
  const canCopyEndpoint = Boolean(endpointUrl);

  const statusItems = [
    { label: 'Slack Webhook URL', env: 'SLACK_WEBHOOK_URL', configured: status.hasSlackWebhookUrl },
    { label: 'Jicoo Signing Secret', env: 'JICOO_SIGNING_SECRET', configured: status.hasJicooSecret },
  ];

  return (
    <main style={mainStyle}>
      <span style={{ fontSize: '3rem' }}>⚡</span>
      <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Jicoo Slack Bot</h1>
      <p style={leadCopyStyle}>
        Jicoo の Webhook を検証して Slack Incoming Webhook へ転送する Next.js (App Router) アプリです。設定値は
        `.env` に定義した環境変数からのみ読み取り、UI では Secrets を扱いません。
      </p>
      <code style={codeStyle}>POST /api/jicoo</code>

      <section style={sectionStyle}>
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>環境変数のセットアップ</h2>
          <p style={paragraphStyle}>
            プロジェクト直下に `.env` を配置し、Slack / Jicoo の認証情報を入力してください。Vercel などにデプロイする場合も同じキーで
            Secrets を登録するだけです。
          </p>
          <pre style={preStyle}>
            SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
            {'\n'}
            JICOO_SIGNING_SECRET=whsec_xxxxxxxxxxxxxxxxxxx
          </pre>
          <p style={hintStyle}>`.env` を更新したら `npm run dev` を再起動することで新しい値が反映されます。</p>
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>現在の状態</h2>
          <ul style={statusListStyle}>
            {statusItems.map((item) => (
              <li key={item.env} style={statusItemStyle}>
                <div style={statusHeaderStyle}>
                  <span>{item.label}</span>
                  <span style={pillStyle(item.configured)}>{item.configured ? '設定済み' : '未設定'}</span>
                </div>
                <small style={envNameStyle}>{item.env}</small>
              </li>
            ))}
          </ul>
          <p style={paragraphStyle}>どちらかが未設定の場合、/api/jicoo は 503 を返し Jicoo からの連携を停止します。</p>
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Jicoo Webhook URL</h2>
          <p style={paragraphStyle}>Jicoo 管理画面の Webhook 設定に以下のエンドポイントを登録してください。</p>
          <div style={endpointRowStyle}>
            <code style={endpointCodeStyle}>{displayEndpoint}</code>
            <button
              type="button"
              id="copy-endpoint-btn"
              data-endpoint={endpointUrl ?? ''}
              style={copyButtonStyle(canCopyEndpoint)}
              disabled={!canCopyEndpoint}
            >
              {canCopyEndpoint ? 'コピー' : 'URL待ち'}
            </button>
          </div>
          {!canCopyEndpoint ? (
            <p style={hintStyle}>Host / X-Forwarded-Proto ヘッダーが無い環境ではコピー機能を無効化しています。</p>
          ) : (
            <script
              dangerouslySetInnerHTML={{ __html: buildCopyButtonScript(endpointUrl ?? '') }}
              suppressHydrationWarning
            />
          )}
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>テストのヒント</h2>
          <p style={paragraphStyle}>
            README に掲載している curl サンプルを使うと署名検証付きでローカルテストが可能です。Slack 側で 5xx が返ると
            Jicoo から再送が行われます。
          </p>
        </article>
      </section>
    </main>
  );
}

async function resolveEndpointUrl(): Promise<string | null> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  if (!host) {
    return null;
  }
  const rawProtocol = headerList.get('x-forwarded-proto') ?? 'http';
  const protocol = rawProtocol.split(',')[0]?.trim() === 'https' ? 'https' : 'http';
  return `${protocol}://${host}/api/jicoo`;
}

const mainStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.5rem',
  minHeight: '100vh',
  textAlign: 'center',
  padding: '2rem',
};

const leadCopyStyle: CSSProperties = {
  maxWidth: 600,
  lineHeight: 1.6,
};

const codeStyle: CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: '0.75rem',
  backgroundColor: '#1e293b',
  fontSize: '0.95rem',
};

const sectionStyle: CSSProperties = {
  width: '100%',
  maxWidth: 640,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const cardStyle: CSSProperties = {
  backgroundColor: '#1e293b',
  padding: '1.5rem',
  borderRadius: '1rem',
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
};

const paragraphStyle: CSSProperties = {
  margin: 0,
  lineHeight: 1.5,
  color: '#cbd5f5',
  fontSize: '0.95rem',
};

const hintStyle: CSSProperties = {
  margin: 0,
  lineHeight: 1.4,
  color: '#94a3b8',
  fontSize: '0.85rem',
};

const preStyle: CSSProperties = {
  backgroundColor: '#0f172a',
  borderRadius: '0.75rem',
  padding: '0.9rem 1rem',
  fontSize: '0.9rem',
  whiteSpace: 'pre-wrap',
};

const statusListStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const statusItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  backgroundColor: '#0f172a',
  borderRadius: '0.75rem',
  padding: '0.9rem 1rem',
};

const statusHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '0.95rem',
};

const envNameStyle: CSSProperties = {
  color: '#94a3b8',
  letterSpacing: '0.03em',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};

const endpointRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const endpointCodeStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  overflowX: 'auto',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  backgroundColor: '#0f172a',
};

const pillStyle = (configured: boolean): CSSProperties => ({
  border: `1px solid ${configured ? '#4ade80' : '#f87171'}`,
  color: configured ? '#4ade80' : '#f87171',
  padding: '0.12rem 0.75rem',
  borderRadius: '999px',
  fontSize: '0.8rem',
  fontWeight: 600,
});

const copyButtonStyle = (enabled: boolean): CSSProperties => ({
  border: '1px solid #38bdf8',
  background: enabled ? '#0f172a' : '#1e293b',
  color: enabled ? '#38bdf8' : '#94a3b8',
  borderRadius: '999px',
  padding: '0.4rem 0.9rem',
  cursor: enabled ? 'pointer' : 'not-allowed',
  transition: 'opacity 0.2s ease',
});

function buildCopyButtonScript(endpoint: string): string {
  const safeEndpoint = JSON.stringify(endpoint);
  return `
    (() => {
      const btn = document.getElementById('copy-endpoint-btn');
      if (!btn) {
        return;
      }
      const value = ${safeEndpoint};
      if (!value || !navigator?.clipboard) {
        btn.disabled = true;
        btn.textContent = 'コピー不可';
        return;
      }
      let timer = null;
      const reset = () => {
        if (timer) clearTimeout(timer);
        btn.dataset.state = 'idle';
        btn.textContent = 'コピー';
      };
      btn.addEventListener('click', async () => {
        if (btn.dataset.state === 'pending') {
          return;
        }
        btn.dataset.state = 'pending';
        try {
          await navigator.clipboard.writeText(value);
          btn.textContent = 'コピー済み';
        } catch (error) {
          console.error('Failed to copy endpoint URL', error);
          btn.textContent = 'コピー失敗';
        } finally {
          timer = setTimeout(reset, 2000);
        }
      });
    })();
  `;
}
