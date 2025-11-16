# Jicoo Slack Bot

Jicoo の予約 Webhook を受信して Slack の Incoming Webhook に通知する Next.js (App Router) プロジェクトです。フロント UI から Slack Webhook URL と Jicoo Signing Secret を入力すると、その値が `.runtime/settings.json` に保持され、即座に API `/api/jicoo` の動作に反映されます（`.env` などへの書き込みは行いません。読み取り専用環境では自動的にメモリ保持へフォールバックします）。

## ディレクトリ構成（抜粋）
```
jicoo-slack-bot/
├─ app/
│  ├─ api/
│  │  ├─ jicoo/route.ts    # Webhook受信 → 署名検証 → Slack通知
│  │  └─ settings/route.ts # UI からの設定保存/取得エンドポイント
│  ├─ layout.tsx           # 1ページ構成のUIラッパー
│  └─ page.tsx             # Slack/Jicoo設定フォーム + Webhook URL コピーUI
├─ lib/
│  └─ runtime-config.ts    # ランタイム保持用の簡易ストア（`.runtime/settings.json` へ永続化）
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 使い方（ローカル開発）
1. 依存をインストールし開発サーバーを起動します。
   ```bash
   npm install
   npm run dev
   ```
2. ブラウザで [http://localhost:3000](http://localhost:3000) を開き、トップページのフォームに `Slack Webhook URL` と `Jicoo Signing Secret` を入力して「設定を保存」を押します。入力値は `.runtime/settings.json` に保存されるため、アプリを再起動しても同じ設定で動作し続けます（ファイルを削除した場合のみ再設定が必要）。
3. 画面中央の「Jicoo Webhook URL」ブロックに現在のエンドポイント（例: `http://localhost:3000/api/jicoo`）が表示され、コピーボタンで値をクリップボードに転送できます。Jicoo 管理画面にはこの URL を登録してください。
4. POST `http://localhost:3000/api/jicoo` に対して Jicoo からの Webhook と同じ形式のリクエストを送ると、保存済みの Slack Webhook URL へ通知が飛びます。署名検証が有効なので、curl テスト時は下記の例を利用してください。

## 署名検証ロジック
`app/api/jicoo/route.ts` では以下を行います。
1. ヘッダー `Jicoo-Webhook-Signature` を `t=<timestamp>, v1=<signature>` としてパース。
2. `timestamp` が現在時刻から ±5 分以内かを確認し、再送攻撃を防止。
3. 検証対象文字列 `timestamp + "." + rawBody` を HMAC-SHA256（キー: Jicoo Signing Secret）でハッシュ化。
4. 生成した署名と `v1` を `crypto.timingSafeEqual` で比較。失敗時は `401` を返却し Slack への通知は行いません。

## curl によるローカル検証例
README の値を UI で保存済みと仮定し、以下のコマンドで署名付きリクエストを送信できます（macOS/Linux 例）。
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
signature=$(printf "%s.%s" "$timestamp" "$payload" | \
  openssl dgst -sha256 -hmac "$JICOO_WEBHOOK_SECRET" | cut -d" " -f2)

curl -X POST http://localhost:3000/api/jicoo \
  -H "Content-Type: application/json" \
  -H "Jicoo-Webhook-Signature: t=$timestamp, v1=$signature" \
  -d "$payload"
```

## UI で設定できる値
- **Slack Webhook URL**: `https://hooks.slack.com/services/...` 形式。入力すると直ちに `/api/jicoo` がその URL へ通知を送信します。
- **Jicoo Signing Secret**: Jicoo の Webhook 設定画面で発行される `whsec_xxx` のようなシークレット。署名検証に使用され、保存後は API レスポンス内ではマスクされた状態でのみ確認できます。

設定済みかどうかは、トップページの「現在の設定」カードで確認できます（Slack URL はマスク表示、Jicoo Secret は登録済み/未登録のみ）。

## Slack 側の準備
1. ワークスペースに「Incoming Webhooks」アプリを追加し、通知先チャンネルを選択。
2. 発行された Webhook URL を UI のフォームに入力して保存します。
3. URL は第三者に知られると悪用されるため、プロジェクトの README やリポジトリには記載しないでください。

## Jicoo 側の準備
1. 管理画面の Webhook 設定で、UI が表示している `https://<ホスト名>/api/jicoo` を登録。
2. Signing Secret を控え、同じく UI のフォームに入力して保存。
3. テスト送信を実行し、レスポンス `{ "ok": true }` と Slack チャンネルへの通知を確認します。

## デプロイと運用の注意
- Vercel などにデプロイすると UI/API はそのまま利用できますが、読み取り専用ファイルシステムのため `.runtime/settings.json` への保存は失敗し、メモリ保持（プロセス終了時に消える）にフォールバックします。長期運用で完全な永続化が必要な場合は KV ストアや Secrets Manager など外部ストレージを併用してください。
- `npm run build` で静的アセットがほとんど無い構成でもビルド可能です。`/api/jicoo` は `runtime='nodejs'` を宣言しているため、Vercel の Node.js ランタイム上で動作します。

## セキュリティとエラーハンドリング
- 署名ヘッダー欠落・フォーマット不正・タイムスタンプずれ・HMAC 不一致はすべて 4xx 応答にし、Jicoo からのリトライ対象になります。
- Slack Webhook への POST が失敗した場合は 502 を返して Jicoo 側での再送を促します。
- UI からの設定は JSON API で受け取り、URL 形式や空文字をサーバー側で必ず検証しています。

## 将来拡張のヒント
`app/api/jicoo/route.ts` の `payload.event` 判定を `switch` へ置き換えれば、`guest_rescheduled` や `guest_cancelled` といった追加イベントのメッセージフォーマットを簡単に差し込めます。Slack へ送る Block Kit をイベントごとに分けたい場合は、`buildSlackPayload` をイベント名を引数にとる関数へ拡張するのが良いでしょう。
