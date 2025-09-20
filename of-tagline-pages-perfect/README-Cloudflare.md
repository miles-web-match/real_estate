# of-tagline — Cloudflare Pages 完全版

- ルート直下に `index.html` と `functions/` を配置済み（余計なサブフォルダなし）
- API は `POST /api/describe`（Workers Runtime）
- CORS プリフライト `OPTIONS` 実装済み
- OpenAI は REST 経由（`OPENAI_API_KEY` 環境変数必須）

## デプロイ（Git 連携）
1. この ZIP の中身をそのまま GitHub リポジトリの **ルート** に置く
2. Cloudflare Pages → Create project → Git 連携
3. Settings → Build configuration:
   - Framework preset: None
   - Build command: (空)
   - Build output directory: (空)
   - Root directory (advanced): (空) ※このZIPをリポ直下で使う場合不要
4. Settings → Environment Variables:
   - `OPENAI_API_KEY`
5. Deploy

### エンドポイント
- `/` → index.html
- `POST /api/describe` → 生成API
