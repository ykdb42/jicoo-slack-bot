# Jicoo Slack Bot

Jicoo の予約 Webhook を受け取り、Slack の Incoming Webhook に通知するだけの最小構成 Next.js (App Router) プロジェクトです。フロントエンド資産をすべて削ぎ落し、`app/api/jicoo/route.ts` に署名検証と Slack 通知ロジックを集約しています。

## ディレクトリ構成（抜粋）
```
jicoo-slack-bot/
├─ app/
│  └─ api/
│     └─ jicoo/
│        └─ route.ts        # Webhook 受信 + Slack 通知
├─ next.config.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 必要な環境変数
`.env.local`（ローカル）および Vercel 上の Environment Variables に同じ値を設定してください。

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
JICOO_WEBHOOK_SECRET=your_jicoo_signing_secret
```

- `SLACK_WEBHOOK_URL`: Slack の Incoming Webhook URL（通知先チャンネルを指定して発行）
- `JICOO_WEBHOOK_SECRET`: Jicoo Webhook 登録画面で表示される Signing Secret。HMAC-SHA256 の検証に利用します。

## セットアップとローカル実行
```bash
npm install
npm run dev
```
Webhook を localhost で受ける場合は、`curl` や ngrok などで `POST http://localhost:3000/api/jicoo` に対して署名付きリクエストを送ります。

## 署名検証フロー
1. Jicoo から届くヘッダー `Jicoo-Webhook-Signature` を `t=<timestamp>, v1=<signature>` 形式でパース。
2. `timestamp` が ±5 分以内か確認してリプレイ攻撃を防止。
3. `signedPayload = timestamp + "." + rawBody` を HMAC-SHA256(`JICOO_WEBHOOK_SECRET`) で計算。
4. `v1` と `expectedSignature` を `crypto.timingSafeEqual` で比較し、失敗時は `401` を返却。

## curl での動作確認例
macOS/Linux などで openssl が使える場合の例です。Windows でも Git Bash で同様に実行できます。

```bash
export JICOO_WEBHOOK_SECRET=your_jicoo_signing_secret
payload='{
  "event": "guest_booked",
  "object": {
    "id": "booking_xxx",
    "startedAt": "2025-11-16T01:00:00Z",
    "endedAt": "2025-11-16T02:00:00Z",
    "eventTypeName": "個別相談（60分）"
  },
  "contact": {
    "name": "山田太郎",
    "email": "taro@example.com"
  }
}'
timestamp=$(date +%s)
signature=$(printf "%s.%s" "$timestamp" "$payload" | openssl dgst -sha256 -hmac "$JICOO_WEBHOOK_SECRET" | cut -d" " -f2)

curl -X POST http://localhost:3000/api/jicoo \
  -H "Content-Type: application/json" \
  -H "Jicoo-Webhook-Signature: t=$timestamp, v1=$signature" \
  -d "$payload"
```

## Slack 側の事前準備
1. Slack ワークスペースで「Incoming Webhooks」アプリを追加。
2. 通知先チャンネルを選び、発行された Webhook URL を環境変数 `SLACK_WEBHOOK_URL` として保存。
3. セキュリティのため Webhook URL は Git に含めず Vercel などの secrets で管理する。

## Jicoo 側の設定
1. 管理画面で Webhook を有効化し、送信先 URL に `https://<your-vercel-app>.vercel.app/api/jicoo` を設定。
2. Signing Secret（例: `whsec_xxx`）を控えて `JICOO_WEBHOOK_SECRET` に設定。
3. guest_booked イベントが有効であることを確認。テスト送信があれば実行してレスポンス `{"ok":true}` を確認する。

## Vercel へのデプロイ
1. GitHub 等に push し、Vercel で新規プロジェクトとして `jicoo-slack-bot` を import。
2. `Settings > Environment Variables` に `SLACK_WEBHOOK_URL` と `JICOO_WEBHOOK_SECRET` を登録（Preview/Production で同じ値にする場合は `Add More` を使用）。
3. `npm run build` が API だけの構成でも問題なく通ることを確認済み。追加のビルド設定は不要。

## エラーハンドリング / セキュリティ
- 署名欠落、フォーマット不正、タイムスタンプのずれ、署名不一致はそれぞれ 4xx を返しログ出力。
- Slack への POST が `2xx` 以外・fetch 失敗の場合は 502 を返却し Jicoo にリトライさせる。
- `crypto.timingSafeEqual` で署名比較し、早期 return で情報を漏洩させないようにしています。

## 将来拡張について
`app/api/jicoo/route.ts` の `payload.event` チェックを `switch` などに変えると、`guest_rescheduled` や `guest_cancelled` 専用の通知フォーマットを追加しやすくなります。Slack 送信前にイベント種別ごとのメッセージビルダーを呼び分ける構造を想定しています。
