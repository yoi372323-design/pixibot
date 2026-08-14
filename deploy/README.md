ピクシボット (Discord Bot テンプレート)

概要:

Node.js (discord.js v14) を使ったスラッシュコマンド対応の最小雛形です。
コマンドフォルダにコマンドを追加すると自動的に読み込まれます。
deploy/register-commands.js で開発ヘルプにコマンドを登録します。
セットアップ:

リポジトリをクローン
ノード 18 以降を利用可能
npm install
.envを作成し、DISCORD_TOKEN / CLIENT_ID / GUILD_IDを設定
DISCORD_TOKEN: Bot まるごと（絶対に公開しない）
CLIENT_ID: Discord アプリのクライアント ID
GUILD_ID: テスト用ギルドのID（開発時はギルド単位で登録するのが早い）
npm run register-commands で開発ギルドへコマンド登録
npm startで起動
コマンド追加方法:

Commands/ に新しい .js を作成してください。
形式: module.exports = { data: new SlashCommandBuilder().setName('...').setDescription('...'), async execute(interaction) { ... } };
デプロイ:

無停止稼働には Railway / Fly.io / VPS / Docker 等を検討してください。
無料ホスティングはスリープする場合があるため注意（UptimePingなどで対策可能）。
セキュリティ:

.env の情報は絶対に公開しないでください。
必要なインテントのみ有効化してください（特権インテントは必要時のみ）。
