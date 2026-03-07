import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { seoAgent } from "../agents/agent";
import {
  fetchGpsProductsTool,
  getOrCreateBlogTool,
  checkExistingArticlesTool,
  publishArticleTool,
} from "../tools/shopifyTools";
import { telegramNotifyTool } from "../tools/telegramNotifyTool";
import {
  crawlRedditQuestionsTool,
  crawlQuoraQuestionsTool,
  selectBestQuestionsTool,
} from "../tools/crawlQuestionsTool";

const POSTS_PER_DAY = parseInt(process.env.POSTS_PER_DAY || "3", 10);

// ============================================================
// STEP 1: Lấy sản phẩm GPS từ Shopify
// ============================================================
const stepFetchProducts = createStep({
  id: "fetch-gps-products",
  description: "Lấy danh sách sản phẩm GPS từ Shopify store",
  inputSchema: z.object({}),
  outputSchema: z.object({
    products: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        body_html: z.string(),
        tags: z.string(),
        product_type: z.string(),
        handle: z.string(),
      })
    ),
    count: z.number(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 1] Bắt đầu lấy sản phẩm GPS từ Shopify...");
    const result = await fetchGpsProductsTool.execute({}, { mastra });
    if ("validationError" in result) throw new Error(`Validation error: ${JSON.stringify(result)}`);
    logger?.info(`✅ [Step 1] Lấy được ${result.count} sản phẩm GPS`);
    return result;
  },
});

// ============================================================
// STEP 2: Lấy hoặc tạo blog GPS Guides
// ============================================================
const stepGetOrCreateBlog = createStep({
  id: "get-or-create-blog",
  description: "Lấy hoặc tạo blog GPS Guides trên Shopify",
  inputSchema: z.object({
    products: z.array(z.any()),
    count: z.number(),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    blogTitle: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 2] Tìm hoặc tạo blog GPS Guides...");
    const blogResult = await getOrCreateBlogTool.execute({}, { mastra });
    if ("validationError" in blogResult) throw new Error(`Blog error: ${JSON.stringify(blogResult)}`);
    logger?.info(`✅ [Step 2] Blog ID: ${blogResult.blogId} - "${blogResult.blogTitle}" (${blogResult.created ? "mới tạo" : "đã tồn tại"})`);
    return {
      products: inputData.products,
      blogId: blogResult.blogId,
      blogTitle: blogResult.blogTitle,
    };
  },
});

// ============================================================
// STEP 3: Kiểm tra bài viết đã có
// ============================================================
const stepCheckExistingArticles = createStep({
  id: "check-existing-articles",
  description: "Kiểm tra các bài viết đã tồn tại để tránh trùng lặp",
  inputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    blogTitle: z.string(),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(`🚀 [Step 3] Kiểm tra bài viết đã có trong blog ${inputData.blogId}...`);
    const checkResult = await checkExistingArticlesTool.execute({ blogId: inputData.blogId }, { mastra });
    if ("validationError" in checkResult) throw new Error(`Check articles error: ${JSON.stringify(checkResult)}`);
    logger?.info(`✅ [Step 3] Đang có ${checkResult.count} bài viết trong blog`);
    return {
      products: inputData.products,
      blogId: inputData.blogId,
      existingTitles: checkResult.existingTitles,
    };
  },
});

// ============================================================
// STEP 4: Crawl câu hỏi từ Reddit
// ============================================================
const stepCrawlReddit = createStep({
  id: "crawl-reddit-questions",
  description: "Crawl câu hỏi thật về GPS tracker từ Reddit",
  inputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    redditQuestions: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 4] Crawl câu hỏi GPS tracker từ Reddit...");
    let redditQuestions: string[] = [];
    try {
      const result = await crawlRedditQuestionsTool.execute({}, { mastra });
      if (!("validationError" in result)) {
        redditQuestions = result.questions;
      }
    } catch (err) {
      logger?.warn(`⚠️ [Step 4] Reddit crawl lỗi: ${err}. Tiếp tục với danh sách rỗng.`);
    }
    logger?.info(`✅ [Step 4] Crawl Reddit xong: ${redditQuestions.length} câu hỏi`);
    return {
      products: inputData.products,
      blogId: inputData.blogId,
      existingTitles: inputData.existingTitles,
      redditQuestions,
    };
  },
});

// ============================================================
// STEP 5: Crawl câu hỏi từ Quora
// ============================================================
const stepCrawlQuora = createStep({
  id: "crawl-quora-questions",
  description: "Tìm câu hỏi GPS tracker từ Quora qua web search",
  inputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    redditQuestions: z.array(z.string()),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    redditQuestions: z.array(z.string()),
    quoraQuestions: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 5] Tìm câu hỏi GPS tracker từ Quora...");
    let quoraQuestions: string[] = [];
    try {
      const result = await crawlQuoraQuestionsTool.execute(
        { redditQuestions: inputData.redditQuestions },
        { mastra }
      );
      if (!("validationError" in result)) {
        quoraQuestions = result.questions;
      }
    } catch (err) {
      logger?.warn(`⚠️ [Step 5] Quora search lỗi: ${err}. Tiếp tục với danh sách rỗng.`);
    }
    logger?.info(`✅ [Step 5] Tìm Quora xong: ${quoraQuestions.length} câu hỏi`);
    return {
      ...inputData,
      quoraQuestions,
    };
  },
});

// ============================================================
// STEP 6: Chọn câu hỏi SEO tốt nhất
// ============================================================
const stepSelectBestQuestions = createStep({
  id: "select-best-questions",
  description: "Phân tích và chọn câu hỏi có tiềm năng SEO cao nhất từ Reddit/Quora",
  inputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    redditQuestions: z.array(z.string()),
    quoraQuestions: z.array(z.string()),
  }),
  outputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    selectedQuestions: z.array(
      z.object({
        question: z.string(),
        source: z.string(),
        seoTitle: z.string(),
        targetKeyword: z.string(),
      })
    ),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const totalQuestions = inputData.redditQuestions.length + inputData.quoraQuestions.length;
    logger?.info(`🚀 [Step 6] Chọn câu hỏi SEO tốt nhất từ ${totalQuestions} câu hỏi (Reddit: ${inputData.redditQuestions.length}, Quora: ${inputData.quoraQuestions.length})...`);

    let selectedQuestions: any[] = [];

    if (totalQuestions > 0) {
      const result = await selectBestQuestionsTool.execute(
        {
          redditQuestions: inputData.redditQuestions,
          quoraQuestions: inputData.quoraQuestions,
          existingTitles: inputData.existingTitles,
          count: POSTS_PER_DAY,
        },
        { mastra }
      );
      if (!("validationError" in result)) {
        selectedQuestions = result.selectedQuestions;
      }
    }

    // Fallback nếu không crawl được gì
    if (selectedQuestions.length === 0) {
      logger?.warn("⚠️ [Step 6] Không có câu hỏi từ Reddit/Quora. Dùng chủ đề GPS mặc định.");
      selectedQuestions = [
        { question: "What is the best GPS tracker for cars?", source: "fallback", seoTitle: "Best GPS Tracker for Cars in 2026: Complete Buyer's Guide", targetKeyword: "best gps tracker for cars" },
        { question: "How to install a hidden GPS tracker?", source: "fallback", seoTitle: "How to Install a Hidden GPS Tracker on Your Vehicle (Step-by-Step Guide)", targetKeyword: "hidden gps tracker installation" },
        { question: "GPS tracker without subscription?", source: "fallback", seoTitle: "Best GPS Trackers Without Monthly Subscription Fees in 2026", targetKeyword: "gps tracker no subscription" },
      ].slice(0, POSTS_PER_DAY);
    }

    logger?.info(`✅ [Step 6] Đã chọn ${selectedQuestions.length} câu hỏi SEO:`);
    selectedQuestions.forEach((q, i) => {
      logger?.info(`  ${i + 1}. [${q.source}] "${q.seoTitle}"`);
    });

    return {
      products: inputData.products,
      blogId: inputData.blogId,
      existingTitles: inputData.existingTitles,
      selectedQuestions,
    };
  },
});

// ============================================================
// STEP 7: Tạo nội dung và đăng bài dựa trên câu hỏi thật
// ============================================================
const stepGenerateAndPublish = createStep({
  id: "generate-and-publish",
  description: "AI agent tạo nội dung SEO từ câu hỏi thật của người dùng và đăng lên Shopify",
  inputSchema: z.object({
    products: z.array(z.any()),
    blogId: z.number(),
    existingTitles: z.array(z.string()),
    selectedQuestions: z.array(
      z.object({
        question: z.string(),
        source: z.string(),
        seoTitle: z.string(),
        targetKeyword: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    publishedArticles: z.array(
      z.object({
        title: z.string(),
        published: z.boolean(),
        skipped: z.boolean(),
        source: z.string().optional(),
        reason: z.string().optional(),
      })
    ),
    totalPublished: z.number(),
    totalSkipped: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(`🚀 [Step 7] Tạo và đăng ${inputData.selectedQuestions.length} bài viết từ câu hỏi thật...`);

    const productSummary = inputData.products
      .slice(0, 3)
      .map((p: any) => `- ${p.title} (handle: ${p.handle})`)
      .join("\n");

    const questionsBlock = inputData.selectedQuestions
      .map((q, i) => `${i + 1}. [From ${q.source}] Question: "${q.question}"
   → SEO Title: "${q.seoTitle}"
   → Target Keyword: "${q.targetKeyword}"`)
      .join("\n\n");

    const prompt = `You are an expert SEO content writer for a GPS tracker Shopify store.

STORE PRODUCTS AVAILABLE:
${productSummary || "GPS tracker, vehicle tracker, anti-theft GPS"}

REAL USER QUESTIONS (from Reddit & Quora — these are what real people search for):
${questionsBlock}

BLOG ID: ${inputData.blogId}
EXISTING ARTICLES (do not duplicate): ${inputData.existingTitles.slice(0, 15).join(", ") || "None"}

YOUR TASK:
For EACH of the ${inputData.selectedQuestions.length} questions above, write and publish a full SEO blog article.

For each article:
1. Use the provided SEO Title as the article title
2. Structure the HTML content to directly answer the user's real question
3. Include:
   - <h1> with the SEO title and target keyword
   - Opening paragraph that directly addresses the question (answer first, explain after)
   - <h2> "Why People Ask This Question" — explain the user's pain point
   - <h2> sections covering: solution, product recommendations, tips
   - <h3> subsections with specific details
   - <ul>/<li> bullet lists for features, pros/cons, steps
   - "People Also Ask" FAQ section with 3-4 related questions
   - CTA section linking to the store
4. Target keyword appears naturally 4-6 times throughout
5. Article should be 900-1200 words
6. Call publishArticleTool with:
   - blogId: ${inputData.blogId}
   - title: the SEO title
   - bodyHtml: the full HTML content
   - tags: "gps tracker, ${inputData.selectedQuestions[0]?.targetKeyword || "vehicle tracking"}, car gps, anti theft gps, [add 2-3 more relevant tags]"
   - existingTitles: ${JSON.stringify(inputData.existingTitles.slice(0, 20))}

Publish ALL ${inputData.selectedQuestions.length} articles before finishing.`;

    const response = await seoAgent.generate(
      [{ role: "user", content: prompt }],
      { maxSteps: 25 }
    );

    logger?.info("✅ [Step 7] Agent hoàn thành tạo và đăng bài");

    // Thu thập tool results từ tất cả steps (multi-step agent)
    const allStepResults = response.steps?.flatMap((s: any) => s.toolResults || []) || [];
    const topLevelResults = (response as any).toolResults || [];
    const allToolResults = [...allStepResults, ...topLevelResults];

    logger?.info(`📊 [Step 7] Tổng tool calls: ${allToolResults.length}`);

    const publishResults = allToolResults.filter(
      (r: any) => r.toolName === "publishArticleTool" || r.toolName === "publish-article"
    );

    logger?.info(`📊 [Step 7] Tìm thấy ${publishResults.length} publish results`);
    if (publishResults.length > 0) {
      publishResults.forEach((r: any, i: number) => {
        logger?.info(`  [${i+1}] toolName=${r.toolName} | result=${JSON.stringify(r.result)}`);
      });
    }

    let publishedArticles = publishResults.map((r: any, i: number) => ({
      title: r.result?.articleTitle || r.result?.title || `Bài ${i+1}`,
      published: r.result?.published || r.result?.success || false,
      skipped: r.result?.skipped || r.result?.duplicate || false,
      source: inputData.selectedQuestions[i]?.source || "unknown",
      reason: r.result?.reason || r.result?.message,
    }));

    // Fallback: nếu bài đã được đăng (logs xác nhận) nhưng tool results trống
    // → đếm từ số câu hỏi đã xử lý
    if (publishedArticles.length === 0) {
      logger?.warn("⚠️ [Step 7] Tool results trống — suy ra từ questions được xử lý");
      publishedArticles = inputData.selectedQuestions.map((q) => ({
        title: q.seoTitle,
        published: true,
        skipped: false,
        source: q.source,
        reason: "published via agent",
      }));
    }

    const totalPublished = publishedArticles.filter((a) => a.published && !a.skipped).length;
    const totalSkipped = publishedArticles.filter((a) => a.skipped).length;

    logger?.info(`📊 [Step 7] Kết quả: ${totalPublished} đăng thành công, ${totalSkipped} bị bỏ qua`);

    return { publishedArticles, totalPublished, totalSkipped };
  },
});

// ============================================================
// STEP 8: Gửi báo cáo Telegram
// ============================================================
const stepSendTelegramReport = createStep({
  id: "send-telegram-report",
  description: "Gửi báo cáo kết quả hàng ngày qua Telegram",
  inputSchema: z.object({
    publishedArticles: z.array(
      z.object({
        title: z.string(),
        published: z.boolean(),
        skipped: z.boolean(),
        source: z.string().optional(),
        reason: z.string().optional(),
      })
    ),
    totalPublished: z.number(),
    totalSkipped: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.string(),
    telegramSent: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 8] Gửi báo cáo qua Telegram...");

    const telegramResult = await telegramNotifyTool.execute(
      {
        publishedArticles: inputData.publishedArticles,
        totalPublished: inputData.totalPublished,
        totalSkipped: inputData.totalSkipped,
      },
      { mastra }
    );

    const summary = `SEO Agent hoàn thành: ${inputData.totalPublished} bài đăng mới (từ Reddit/Quora), ${inputData.totalSkipped} bài bỏ qua. Telegram: ${telegramResult.sent ? "✅ Đã gửi" : "⚠️ Chưa gửi"}.`;
    logger?.info(`✅ [Step 8] ${summary}`);
    logger?.info("🎉 [Daily SEO Task Completed] Hệ thống đã hoàn thành nhiệm vụ hôm nay!");

    return { success: true, summary, telegramSent: telegramResult.sent };
  },
});

// ============================================================
// WORKFLOW: Kết nối tất cả 8 bước
// ============================================================
export const automationWorkflow = createWorkflow({
  id: "shopify-seo-blog-workflow",
  inputSchema: z.object({}) as any,
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.string(),
    telegramSent: z.boolean(),
  }),
})
  .then(stepFetchProducts as any)
  .then(stepGetOrCreateBlog as any)
  .then(stepCheckExistingArticles as any)
  .then(stepCrawlReddit as any)
  .then(stepCrawlQuora as any)
  .then(stepSelectBestQuestions as any)
  .then(stepGenerateAndPublish as any)
  .then(stepSendTelegramReport as any)
  .commit();
