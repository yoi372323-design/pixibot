// commands/evaluate.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fetch = require('node-fetch'); // node 18+ なら組み込み fetch でも可
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evaluate')
    .setDescription('画像をAIで評価して、その後みんなで投票します。画像URLを指定するか、直前のメッセージに添付してください。')
    .addStringOption(opt => opt.setName('url').setDescription('画像のURL（任意）').setRequired(false))
    .addIntegerOption(opt => opt.setName('time').setDescription('投票時間（秒、デフォルト60）').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();

    const imageUrlOption = interaction.options.getString('url');
    const voteTime = Math.max(5, Math.min(600, interaction.options.getInteger('time') || 60)); // 5〜600秒の範囲

    // 1) 画像URLを解決：オプション優先、なければチャンネルの直近メッセージから添付を探す
    let imageUrl = imageUrlOption || null;
    if (!imageUrl) {
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 8 });
        for (const msg of messages.values()) {
          if (msg.attachments && msg.attachments.size > 0) {
            const att = msg.attachments.find(a => a.contentType?.startsWith('image') || a.name?.match(/\.(png|jpe?g|webp|gif)$/i));
            if (att) { imageUrl = att.url; break; }
          }
        }
      } catch (err) {
        console.error('メッセージ取得エラー', err);
      }
    }

    if (!imageUrl) {
      return interaction.editReply('画像が見つかりませんでした。`url` オプションで画像URLを渡すか、先にチャンネルへ画像をアップロードしてから再度コマンドを実行してください。');
    }

    // 2) Gemini（等）へ評価リクエスト
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_ENDPOINT = process.env.GEMINI_API_ENDPOINT || 'https://api.example.com/v1/images:evaluate'; // 実際のエンドポイントに置換

    if (!GEMINI_API_KEY) {
      return interaction.editReply('サーバ側で GEMINI_API_KEY が設定されていません。管理者に教えてください。');
    }

    let aiResult;
    try {
      const payload = {
        image_url: imageUrl,
        // 簡易プロンプト：必要に応じて詳細化（評価軸など）
        prompt: '次の画像を次の観点で評価してください：視覚的魅力（0-100）、創造性（0-100）、改善点（テキスト）。JSONで { score: number, creativity: number, comment: string } の形で返してください。'
      };

      const res = await fetch(GEMINI_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GEMINI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        timeout: 30_000
      });

      if (!res.ok) {
        const text = await res.text().catch(()=>'<no body>');
        throw new Error(`AI API error ${res.status}: ${text}`);
      }
      aiResult = await res.json();
    } catch (err) {
      console.error('AI評価エラー', err);
      return interaction.editReply('AI評価に失敗しました。後で再試行してください。エラーログを管理者に報告してください。');
    }

    // 期待される aiResult の形にフォールバック
    // 例: { score: 86, creativity: 70, comment: "良い構図..." }
    const score = aiResult.score ?? aiResult.scores?.overall ?? null;
    const creativity = aiResult.creativity ?? null;
    const comment = aiResult.comment ?? aiResult.reason ?? JSON.stringify(aiResult).slice(0, 800);

    // 3) 評価結果を埋め込みで送信し、ボタンで投票を受け付ける
    const embed = new EmbedBuilder()
      .setTitle('画像評価結果')
      .setImage(imageUrl)
      .addFields(
        { name: 'AIスコア', value: score !== null ? `${score}` : 'N/A', inline: true },
        { name: '創造性', value: creativity !== null ? `${creativity}` : 'N/A', inline: true },
      )
      .setDescription(comment)
      .setFooter({ text: `投票時間: ${voteTime}秒` })
      .setTimestamp();

    const upBtn = new ButtonBuilder().setCustomId('vote_up').setLabel('👍 良い').setStyle(ButtonStyle.Success);
    const downBtn = new ButtonBuilder().setCustomId('vote_down').setLabel('👎 微妙').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(upBtn, downBtn);

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    // 4) 投票を収集（1ユーザー1票）
    const votes = new Map(); // userId -> 1 or -1
    const collector = msg.createMessageComponentCollector({ time: voteTime * 1000 });

    collector.on('collect', async i => {
      const uid = i.user.id;
      if (votes.has(uid)) {
        // 既に投票済みなら軽く応答（ephemeral）
        await i.reply({ content: 'あなたはすでに投票済みです。', ephemeral: true });
        return;
      }
      const v = i.customId === 'vote_up' ? 1 : -1;
      votes.set(uid, v);
      await i.reply({ content: '投票を受け付けました。ありがとうございます！', ephemeral: true });
    });

    collector.on('end', async () => {
      const up = [...votes.values()].filter(v => v === 1).length;
      const down = [...votes.values()].filter(v => v === -1).length;
      const total = up + down;
      const resultDesc = `投票結果：👍 ${up}票 / 👎 ${down}票（合計 ${total}票）`;

      const resultEmbed = EmbedBuilder.from(embed)
        .setFields(...embed.data.fields)
        .setFooter({ text: `投票終了 — ${total}票` })
        .setDescription((comment || '') + '\n\n' + resultDesc);

      // disable buttons
      const disabledRow = new ActionRowBuilder().addComponents(
        upBtn.setDisabled(true),
        downBtn.setDisabled(true)
      );

      await interaction.editReply({ embeds: [resultEmbed], components: [disabledRow] });
    });
  }
};
