# Jicoo Slack Bot

Jicoo の予約 Webhook を検証し、Slack Incoming Webhook へ即座に転送する Next.js (App Router) プロジェクトです。Slack Webhook URL と Jicoo Signing Secret は UI ではなく `.env` / 環境変数から読み取るように変更され、Secrets をブラウザへ露出させずに運用できます。

## ディレクトリ構成（抜粋）

```
jicoo-slack-bot/
├─ app/
│  ├─ api/
│  │  └─ jicoo/route.ts       # Webhook を受信 → 署名検証 → Slack 通知
│  ├─ layout.tsx
│  └─ page.tsx                # 環境変数の状態と Webhook URL を表示
├─ components/
│  └─ copy-button.tsx         # Webhook URL をコピーするクライアントコンポーネント
├─ lib/
│  └─ env.ts                  # SLACK_WEBHOOK_URL / JICOO_SIGNING_SECRET の読み出し
├─ .env.example
├─ package.json
└─ README.md
```

## セットアップ

1. 依存をインストールして開発サーバーを起動します。
   ```bash
   npm install
   npm run dev
   ```
2. `.env.example` を `.env` にコピーし、それぞれの値を入力します。
   ```bash
   cp .env.example .env
   # 以下を自分の環境に合わせて編集
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
   JICOO_SIGNING_SECRET=whsec_xxxxxxxxxx
   ```
3. ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。トップページには現在の環境変数の状態と、Jicoo に登録する Webhook URL (`http://localhost:3000/api/jicoo`) が表示されます。
4. `/api/jicoo` に Jicoo と同じ形式の Webhook を POST すると、`.env` に入力した Slack Webhook へメッセージが送信されます。どちらかの環境変数が未設定の場合は 503 を返し、Slack へは通知しません。

## 環境変数

| 変数名                | 用途                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| `SLACK_WEBHOOK_URL`   | Slack の Incoming Webhook URL。`https://hooks.slack.com/services/...` |
| `JICOO_SIGNING_SECRET` | Jicoo Webhook 設定画面で発行される `whsec_xxx` 形式のシークレット        |

Vercel などにデプロイする際は同じキーでプロジェクト環境変数を作成してください。`npm run dev` を再起動すると新しい値が読み込まれます。

## 署名検証ロジック

`app/api/jicoo/route.ts` では以下を行います。

1. ヘッダー `Jicoo-Webhook-Signature` を `t=<timestamp>, v1=<signature>` 形式でパース。
2. `timestamp` が現在時刻から ±5 分以内かを確認し、リプレイ攻撃を防止。
3. 検証対象文字列 `timestamp + "." + rawBody` を HMAC-SHA256（キー: `JICOO_SIGNING_SECRET`）でハッシュ化。
4. 生成された署名と `v1` を `crypto.timingSafeEqual` で比較し、失敗時は `401` を返却。Slack への通知は行いません。

## curl によるローカル検証（macOS/Linux）

```bash
export JICOO_WEBHOOK_SECRET=your_jicoo_signing_secret
payload='{
  "event": "guest_booked",
  "object": {
    "id": "booking_xxx",
    "startedAt": "2025-11-16T01:00:00Z",
    "endedAt": "2025-11-16T02:00:00Z",
    "eventTypeName": "個別相談"
  },
  "contact": {
    "name": "山田太郎",
    "email": "taro@example.com"
  }
}'
timestamp=$(date +%s)
signature=$(printf "%s.%s" "$timestamp" "$payload" | \
  openssl dgst -sha256 -hmac "$JICOO_WEBHOOK_SECRET" | cut -d" " -f2)

curl -X POST http://localhost:3000/api/jicoo \
  -H "Content-Type: application/json" \
  -H "Jicoo-Webhook-Signature: t=$timestamp, v1=$signature" \
  -d "$payload"
```

## Slack 側の準備

1. ワークスペースに「Incoming Webhooks」アプリを追加。
2. 通知先チャンネルを選択し、発行された Webhook URL を `SLACK_WEBHOOK_URL` に設定。
3. URL は第三者に知られると悪用されるため、リポジトリや README に直接記載しないでください。

## Jicoo 側の準備

1. 管理画面の Webhook 設定で、UI に表示される `https://<ホスト名>/api/jicoo` を登録。
2. Signing Secret を控え、`JICOO_SIGNING_SECRET` に設定。
3. テスト送信を実行し、レスポンス `{ "ok": true }` と Slack チャンネルへの通知を確認します。

## デプロイと運用の注意

- `SLACK_WEBHOOK_URL` / `JICOO_SIGNING_SECRET` が未設定のときは `/api/jicoo` が 503 を返します。Vercel 環境変数の漏れに早く気づけるよう UI でも状態を確認できます。
- `npm run build` 時は静的アセットのみを生成し、`/api/jicoo` は `runtime='nodejs'` を宣言した Edge ではない Node.js 関数として配備されます。
- Slack Webhook への POST が失敗した場合は 502 を返却して Jicoo 側のリトライを促します。

## 拡張のヒント

`app/api/jicoo/route.ts` の `payload.event` 判定を `switch` に置き換えると、`guest_rescheduled` や `guest_cancelled` 用の Block Kit を追加しやすくなります。Slack 側のフォーマットをイベント別に変えたい場合は `buildSlackPayload` をイベント名を受け取る関数にリファクタリングしてください。
