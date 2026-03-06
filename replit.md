# Shopify SEO Blog Agent

## Tổng Quan
Hệ thống tự động nghiên cứu, viết và đăng bài SEO hàng ngày lên blog Shopify cho cửa hàng bán GPS tracker. Sau khi hoàn thành, gửi báo cáo qua Telegram.

## Cấu Hình
- **Cửa hàng Shopify:** 4517f4-7f.myshopify.com
- **Niche sản phẩm:** GPS tracker (vehicle GPS, anti-theft GPS, car tracking)
- **Blog Shopify:** "GPS Guides" (tự động tạo nếu chưa có)
- **Số bài/ngày:** 3 bài (cấu hình qua `POSTS_PER_DAY`)
- **Lịch chạy:** 2:00 AM UTC hàng ngày (= 9:00 SA giờ Việt Nam)

## Kiến Trúc

### Stack
- **Framework:** Mastra (TypeScript)
- **AI Model:** OpenAI GPT-5 (qua Replit AI Integrations)
- **Scheduler:** Inngest (cron trigger)
- **Notifications:** Telegram Bot

### Cấu Trúc Files
```
src/mastra/
├── agents/agent.ts         # SEO Agent - viết và đăng bài
├── tools/
│   ├── shopifyTools.ts     # Shopify API tools (fetch, blog, publish)
│   └── telegramNotifyTool.ts # Telegram notification
├── workflows/workflow.ts   # 5-step workflow pipeline
└── index.ts               # Mastra instance + cron trigger
```

### Workflow (5 bước)
1. **fetch-gps-products** - Lấy sản phẩm GPS từ Shopify (lọc theo keyword)
2. **get-or-create-blog** - Tìm hoặc tạo blog "GPS Guides"
3. **check-existing-articles** - Kiểm tra bài đã có để tránh duplicate
4. **generate-and-publish** - AI Agent tạo nội dung SEO và đăng lên Shopify
5. **send-telegram-report** - Gửi báo cáo kết quả qua Telegram

## Environment Variables & Secrets
| Tên | Loại | Mô Tả |
|-----|------|--------|
| `SHOPIFY_ACCESS_TOKEN` | Secret | Shopify Admin API token |
| `TELEGRAM_BOT_TOKEN` | Secret | Token Telegram Bot |
| `TELEGRAM_CHAT_ID` | Secret | Chat ID nhận thông báo |
| `SHOPIFY_STORE_URL` | Env Var | Domain cửa hàng |
| `BLOG_NAME` | Env Var | Tên blog (mặc định: "GPS Guides") |
| `POSTS_PER_DAY` | Env Var | Số bài/ngày (mặc định: 3) |
| `SCHEDULE_CRON_EXPRESSION` | Env Var | Override lịch cron |
| `AI_INTEGRATIONS_OPENAI_*` | Auto | Replit AI Integrations |

## Test Thủ Công
```bash
npx tsx tests/testCronAutomation.ts
```

## Thay Đổi Lịch Chạy
Chỉnh `SCHEDULE_CRON_EXPRESSION` trong environment variables.
Ví dụ: `0 1 * * *` = 1:00 AM UTC = 8:00 SA giờ Việt Nam

## Dependencies
- `@mastra/core`, `@mastra/inngest`, `@mastra/memory`, `@mastra/pg`
- `@ai-sdk/openai`, `openai`
- `inngest`, `zod`
