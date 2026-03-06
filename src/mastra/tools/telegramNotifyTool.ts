import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const telegramNotifyTool = createTool({
  id: "telegram-notify",
  description: "Gửi thông báo kết quả hàng ngày qua Telegram bot.",
  inputSchema: z.object({
    publishedArticles: z.array(
      z.object({
        title: z.string(),
        published: z.boolean(),
        skipped: z.boolean(),
        reason: z.string().optional(),
      })
    ).describe("Danh sách bài viết đã xử lý"),
    totalPublished: z.number().describe("Số bài viết đã đăng thành công"),
    totalSkipped: z.number().describe("Số bài viết bị bỏ qua"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ publishedArticles, totalPublished, totalSkipped }, context) => {
    const logger = context?.mastra?.getLogger();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      logger?.warn("⚠️ [telegramNotifyTool] TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa được cấu hình. Bỏ qua thông báo.");
      return {
        sent: false,
        message: "Telegram chưa được cấu hình",
      };
    }

    logger?.info(`📨 [telegramNotifyTool] Chuẩn bị gửi thông báo Telegram...`);

    const now = new Date();
    const dateStr = now.toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    });

    let articleList = "";
    for (const article of publishedArticles) {
      const sourceTag = (article as any).source && (article as any).source !== "unknown" && (article as any).source !== "fallback"
        ? ` _[${(article as any).source}]_`
        : "";
      if (article.published) {
        articleList += `\n✅ ${article.title}${sourceTag}`;
      } else if (article.skipped) {
        articleList += `\n⏭️ ${article.title} (đã tồn tại)`;
      }
    }

    if (!articleList) {
      articleList = "\nKhông có bài viết nào được xử lý";
    }

    const redditCount = publishedArticles.filter((a) => (a as any).source === "Reddit" && a.published).length;
    const quoraCount = publishedArticles.filter((a) => (a as any).source === "Quora" && a.published).length;

    const sourceBreakdown = redditCount > 0 || quoraCount > 0
      ? `• Reddit questions: *${redditCount}* bài\n• Quora questions: *${quoraCount}* bài\n`
      : "";

    const message = `
🤖 *Báo Cáo SEO Blog Hàng Ngày*
📅 Ngày: ${dateStr} | ⏰ ${timeStr}

📊 *Kết Quả:*
• Đăng thành công: *${totalPublished}* bài
• Bỏ qua (trùng lặp): *${totalSkipped}* bài
${sourceBreakdown}
🔍 *Nguồn chủ đề:* Reddit & Quora (câu hỏi thật của users)

📝 *Chi Tiết Bài Viết:*${articleList}

🏪 Cửa hàng: [GPS Tracker Store](https://4517f4-7f.myshopify.com)
🔗 Blog: [GPS Guides](https://4517f4-7f.myshopify.com/blogs/gps-guides)

_Hệ thống sẽ tự động chạy lại vào ngày mai lúc 9:00 SA (VN)_
    `.trim();

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });

    const responseData = await response.json() as any;

    if (!response.ok || !responseData.ok) {
      logger?.error(`❌ [telegramNotifyTool] Lỗi gửi Telegram: ${JSON.stringify(responseData)}`);
      return {
        sent: false,
        message: `Lỗi: ${responseData.description || "Unknown error"}`,
      };
    }

    logger?.info(`✅ [telegramNotifyTool] Đã gửi thông báo Telegram thành công!`);
    return {
      sent: true,
      message: "Đã gửi thông báo Telegram thành công",
    };
  },
});
