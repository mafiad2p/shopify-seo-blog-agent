import * as dotenv from "dotenv";
dotenv.config();

const SHOPIFY_STORE = "4517f4-7f.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const BLOG_ID = "81734369352";

async function shopifyGet(path: string) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01${path}`, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  });
  return res.json();
}

async function main() {
  console.log("\n========================================");
  console.log("📊  BÁO CÁO SEO BLOG - GPS GUIDES");
  console.log("========================================\n");

  // Lấy danh sách bài viết
  const data = await shopifyGet(`/blogs/${BLOG_ID}/articles.json?limit=50&fields=id,title,created_at,published_at,author`);
  const articles = data.articles || [];

  console.log(`📝 Tổng số bài viết: ${articles.length}`);

  // Nhóm theo ngày
  const byDate: Record<string, any[]> = {};
  for (const article of articles) {
    const date = new Date(article.created_at).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(article);
  }

  // Hiển thị theo ngày (mới nhất trước)
  const sortedDates = Object.keys(byDate).sort((a, b) => {
    const [da, ma, ya] = a.split("/").map(Number);
    const [db, mb, yb] = b.split("/").map(Number);
    return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
  });

  console.log("\n📅 Bài viết theo ngày:\n");
  for (const date of sortedDates) {
    const dayArticles = byDate[date];
    console.log(`  📅 ${date} — ${dayArticles.length} bài`);
    for (const a of dayArticles) {
      const time = new Date(a.created_at).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      });
      console.log(`     • [${time}] ${a.title}`);
    }
    console.log();
  }

  // Thống kê
  const today = new Date().toLocaleDateString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const todayCount = byDate[today]?.length || 0;

  console.log("========================================");
  console.log(`✅ Hôm nay (${today}): ${todayCount} bài mới`);
  console.log(`📚 Tổng cộng: ${articles.length} bài trong blog "GPS Guides"`);
  console.log(`🔗 Blog: https://${SHOPIFY_STORE}/blogs/gps-guides`);
  console.log("========================================\n");
}

main().catch(console.error);
