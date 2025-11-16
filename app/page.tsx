export default function HomePage() {
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
        デプロイや設定手順は README を参照してください。
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
    </main>
  );
}
