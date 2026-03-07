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

async function sendTelegram(botToken: string, chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
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

  // Lấy 3 ngày gần nhất
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

async function handleCommand(
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
      const data = await shopifyGet(
        `/blogs/${BLOG_ID}/articles/count.json`
      );
      const count = data.count ?? "?";
      await sendTelegram(botToken, chatId, `📚 Blog *GPS Guides* hiện có *${count} bài viết* tổng cộng.`);
    } catch (err) {
      await sendTelegram(botToken, chatId, `❌ Lỗi: ${err}`);
    }
  }
}

export async function startTelegramBot(logger?: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) {
    logger?.warn("⚠️ [TelegramBot] TELEGRAM_BOT_TOKEN chưa cấu hình, bỏ qua bot polling.");
    return;
  }

  logger?.info("🤖 [TelegramBot] Khởi động Telegram bot polling...");

  // Xóa session cũ trước khi bắt đầu
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=1&timeout=0`);
    logger?.info("🔄 [TelegramBot] Đã reset session cũ");
  } catch {}

  let offset = 0;
  let backoffMs = 1000;
  const MAX_BACKOFF = 30000;

  const poll = async (): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=20&allowed_updates=["message"]`,
        { signal: AbortSignal.timeout(25000) }
      );

      if (res.status === 409) {
        logger?.warn(`⚠️ [TelegramBot] Conflict 409 — chờ ${backoffMs / 1000}s rồi thử reset...`);
        // Thử force-reset connection bằng getUpdates với timeout=0
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=1&timeout=0`);
        } catch {}
        return false;
      }

      if (!res.ok) {
        logger?.warn(`⚠️ [TelegramBot] getUpdates lỗi HTTP ${res.status}`);
        return false;
      }

      const data = await res.json() as any;
      if (!data.ok || !data.result?.length) return true;

      for (const update of data.result) {
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg?.text) continue;

        const fromId = msg.chat.id;
        const text: string = msg.text;

        if (chatId && String(fromId) !== String(chatId)) {
          logger?.warn(`⚠️ [TelegramBot] Tin từ chat_id lạ: ${fromId}, bỏ qua.`);
          continue;
        }

        if (text.startsWith("/")) {
          logger?.info(`📩 [TelegramBot] Nhận lệnh "${text}" từ chat ${fromId}`);
          await handleCommand(botToken, fromId, text, logger);
        }
      }
      return true;
    } catch (err: any) {
      if (!err?.message?.includes("abort")) {
        logger?.warn(`⚠️ [TelegramBot] Polling lỗi: ${err?.message}`);
      }
      return false;
    }
  };

  // Chạy polling liên tục với exponential backoff khi lỗi
  const loop = async () => {
    while (true) {
      const success = await poll();
      if (success) {
        backoffMs = 1000;
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
      }
    }
  };

  loop().catch((err) => logger?.error(`❌ [TelegramBot] Loop lỗi: ${err}`));
  logger?.info("✅ [TelegramBot] Bot đang lắng nghe lệnh. Gõ /report trong Telegram để thử.");
}
