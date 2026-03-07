const SHOPIFY_STORE = "4517f4-7f.myshopify.com";
const BLOG_ID = "81734369352";

async function shopifyGet(path: string) {
  const token = process.env.SHOPIFY_ACCESS_TOKEN!;
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01${path}`, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  return res.json();
}

export async function sendTelegram(botToken: string, chatId: string | number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  return res.json();
}

async function buildReport(): Promise<string> {
  const data = await shopifyGet(
    `/blogs/${BLOG_ID}/articles.json?limit=50&fields=id,title,created_at`
  );
  const articles: any[] = data.articles || [];

  const byDate: Record<string, any[]> = {};
  for (const a of articles) {
    const date = new Date(a.created_at).toLocaleDateString("vi-VN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(a);
  }

  const today = new Date().toLocaleDateString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const todayArticles = byDate[today] || [];

  const sortedDates = Object.keys(byDate).sort((a, b) => {
    const parse = (s: string) => {
      const [d, m, y] = s.split("/").map(Number);
      return new Date(y, m - 1, d).getTime();
    };
    return parse(b) - parse(a);
  }).slice(0, 3);

  let recentLines = "";
  for (const date of sortedDates) {
    const list = byDate[date];
    recentLines += `\n📅 *${date}* — ${list.length} bài`;
    for (const a of list.slice(0, 3)) {
      const title = a.title.length > 50 ? a.title.slice(0, 47) + "..." : a.title;
      recentLines += `\n  • ${title}`;
    }
    if (list.length > 3) recentLines += `\n  _...và ${list.length - 3} bài khác_`;
  }

  const now = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return `📊 *Báo Cáo Blog GPS Guides*
⏰ Cập nhật lúc ${now}

📌 Hôm nay: *${todayArticles.length} bài mới*
📚 Tổng cộng: *${articles.length} bài*

${recentLines ? `📝 *Bài viết gần đây:*${recentLines}` : ""}

🔗 [Xem blog](https://${SHOPIFY_STORE}/blogs/gps-guides)
_Cron chạy tự động lúc 9:00 SA (VN)_`;
}

export async function handleCommand(
  botToken: string,
  chatId: string | number,
  text: string,
  logger?: any
) {
  const cmd = text.trim().split(" ")[0].toLowerCase();

  if (cmd === "/start") {
    await sendTelegram(
      botToken,
      chatId,
      `👋 *Xin chào! Tôi là GPS SEO Bot*\n\nCác lệnh có thể dùng:\n• /report — Báo cáo blog đầy đủ\n• /today — Bài đăng hôm nay\n• /total — Tổng số bài viết\n• /help — Hướng dẫn`
    );
  } else if (cmd === "/help") {
    await sendTelegram(
      botToken,
      chatId,
      `📋 *Danh sách lệnh:*\n\n/report — Báo cáo tổng quan blog\n/today — Xem bài đăng hôm nay\n/total — Đếm tổng số bài\n/start — Chào mừng\n/help — Hiện bảng này`
    );
  } else if (cmd === "/report") {
    await sendTelegram(botToken, chatId, "⏳ Đang lấy dữ liệu...");
    try {
      const report = await buildReport();
      await sendTelegram(botToken, chatId, report);
    } catch (err) {
      logger?.error(`❌ [TelegramBot] Lỗi /report: ${err}`);
      await sendTelegram(botToken, chatId, `❌ Lỗi lấy báo cáo: ${err}`);
    }
  } else if (cmd === "/today") {
    try {
      const data = await shopifyGet(
        `/blogs/${BLOG_ID}/articles.json?limit=50&fields=id,title,created_at`
      );
      const articles: any[] = data.articles || [];
      const today = new Date().toLocaleDateString("vi-VN", {
        year: "numeric", month: "2-digit", day: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const todayArticles = articles.filter((a) => {
        const date = new Date(a.created_at).toLocaleDateString("vi-VN", {
          year: "numeric", month: "2-digit", day: "2-digit",
          timeZone: "Asia/Ho_Chi_Minh",
        });
        return date === today;
      });

      if (todayArticles.length === 0) {
        await sendTelegram(botToken, chatId, `📭 Hôm nay (${today}) chưa có bài mới.`);
      } else {
        let msg = `📰 *Bài đăng hôm nay (${today}):*\n`;
        for (const a of todayArticles) {
          const time = new Date(a.created_at).toLocaleTimeString("vi-VN", {
            hour: "2-digit", minute: "2-digit",
            timeZone: "Asia/Ho_Chi_Minh",
          });
          msg += `\n• [${time}] ${a.title}`;
        }
        msg += `\n\n✅ Tổng: *${todayArticles.length} bài*`;
        await sendTelegram(botToken, chatId, msg);
      }
    } catch (err) {
      await sendTelegram(botToken, chatId, `❌ Lỗi: ${err}`);
    }
  } else if (cmd === "/total") {
    try {
      const data = await shopifyGet(`/blogs/${BLOG_ID}/articles/count.json`);
      const count = data.count ?? "?";
      await sendTelegram(botToken, chatId, `📚 Blog *GPS Guides* hiện có *${count} bài viết* tổng cộng.`);
    } catch (err) {
      await sendTelegram(botToken, chatId, `❌ Lỗi: ${err}`);
    }
  }
}

export async function handleWebhookUpdate(update: any, logger?: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) return;

  const msg = update.message;
  if (!msg?.text) return;

  const fromId = msg.chat.id;
  const text: string = msg.text;

  if (chatId && String(fromId) !== String(chatId)) {
    logger?.warn(`⚠️ [Webhook] Tin từ chat_id lạ: ${fromId}, bỏ qua.`);
    return;
  }

  if (text.startsWith("/")) {
    logger?.info(`📩 [Webhook] Nhận lệnh "${text}" từ chat ${fromId}`);
    await handleCommand(botToken, fromId, text, logger);
  }
}

export async function registerWebhook(logger?: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN;

  if (!botToken) {
    logger?.warn("⚠️ [Webhook] TELEGRAM_BOT_TOKEN chưa cấu hình, bỏ qua.");
    return;
  }

  if (!appUrl) {
    logger?.warn("⚠️ [Webhook] APP_URL chưa cấu hình, bỏ qua đăng ký webhook.");
    return;
  }

  const baseUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
  const webhookUrl = `${baseUrl}/api/telegram-webhook`;

  try {
    const checkRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const checkData = await checkRes.json() as any;
    const currentUrl = checkData.result?.url;

    if (currentUrl === webhookUrl) {
      logger?.info(`✅ [Webhook] Telegram webhook đã đăng ký: ${webhookUrl}`);
      return;
    }

    logger?.info(`🔗 [Webhook] Đăng ký Telegram webhook: ${webhookUrl}`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    });
    const data = await res.json() as any;
    if (data.ok) {
      logger?.info(`✅ [Webhook] Đăng ký thành công! URL: ${webhookUrl}`);
    } else {
      logger?.error(`❌ [Webhook] Đăng ký thất bại: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    logger?.error(`❌ [Webhook] Lỗi đăng ký: ${err}`);
  }
}
