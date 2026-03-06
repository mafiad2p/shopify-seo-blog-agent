import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || "4517f4-7f.myshopify.com";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const SHOPIFY_API_VERSION = "2024-01";
const BLOG_NAME = process.env.BLOG_NAME || "GPS Guides";

function shopifyHeaders() {
  return {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  };
}

function shopifyUrl(path: string) {
  return `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}${path}`;
}

export const fetchGpsProductsTool = createTool({
  id: "fetch-gps-products",
  description: "Lấy danh sách sản phẩm GPS tracker từ Shopify store. Lọc các sản phẩm liên quan đến GPS, tracker, vehicle tracking.",
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
  execute: async (_input, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info("🔍 [fetchGpsProductsTool] Đang lấy danh sách sản phẩm GPS từ Shopify...");

    const response = await fetch(shopifyUrl("/products.json?limit=50"), {
      headers: shopifyHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger?.error(`❌ [fetchGpsProductsTool] Lỗi Shopify API: ${response.status} ${errText}`);
      throw new Error(`Shopify API error: ${response.status} ${errText}`);
    }

    const data = await response.json() as { products: any[] };
    const allProducts = data.products || [];

    const gpsKeywords = ["gps", "tracker", "tracking", "vehicle", "car tracker", "anti theft", "anti-theft"];
    const gpsProducts = allProducts.filter((p: any) => {
      const searchText = `${p.title} ${p.tags} ${p.product_type} ${p.body_html}`.toLowerCase();
      return gpsKeywords.some((kw) => searchText.includes(kw));
    });

    logger?.info(`✅ [fetchGpsProductsTool] Tìm thấy ${gpsProducts.length}/${allProducts.length} sản phẩm GPS`);

    return {
      products: gpsProducts.map((p: any) => ({
        id: p.id,
        title: p.title || "",
        body_html: p.body_html || "",
        tags: p.tags || "",
        product_type: p.product_type || "",
        handle: p.handle || "",
      })),
      count: gpsProducts.length,
    };
  },
});

export const getOrCreateBlogTool = createTool({
  id: "get-or-create-blog",
  description: "Lấy hoặc tạo blog 'GPS Guides' trên Shopify. Trả về blog_id để đăng bài.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    blogId: z.number(),
    blogTitle: z.string(),
    created: z.boolean(),
  }),
  execute: async (_input, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(`🔍 [getOrCreateBlogTool] Đang tìm blog "${BLOG_NAME}"...`);

    const listRes = await fetch(shopifyUrl("/blogs.json"), {
      headers: shopifyHeaders(),
    });

    if (!listRes.ok) {
      throw new Error(`Shopify blogs API error: ${listRes.status}`);
    }

    const listData = await listRes.json() as { blogs: any[] };
    const existingBlog = (listData.blogs || []).find(
      (b: any) => b.title.toLowerCase() === BLOG_NAME.toLowerCase()
    );

    if (existingBlog) {
      logger?.info(`✅ [getOrCreateBlogTool] Blog đã tồn tại. ID: ${existingBlog.id}`);
      return {
        blogId: existingBlog.id,
        blogTitle: existingBlog.title,
        created: false,
      };
    }

    logger?.info(`📝 [getOrCreateBlogTool] Tạo blog mới "${BLOG_NAME}"...`);
    const createRes = await fetch(shopifyUrl("/blogs.json"), {
      method: "POST",
      headers: shopifyHeaders(),
      body: JSON.stringify({ blog: { title: BLOG_NAME } }),
    });

    if (!createRes.ok) {
      throw new Error(`Shopify create blog error: ${createRes.status}`);
    }

    const createData = await createRes.json() as { blog: any };
    logger?.info(`✅ [getOrCreateBlogTool] Tạo blog thành công. ID: ${createData.blog.id}`);

    return {
      blogId: createData.blog.id,
      blogTitle: createData.blog.title,
      created: true,
    };
  },
});

export const checkExistingArticlesTool = createTool({
  id: "check-existing-articles",
  description: "Kiểm tra các bài viết đã tồn tại trong blog để tránh đăng bài trùng lặp.",
  inputSchema: z.object({
    blogId: z.number().describe("ID của blog Shopify"),
  }),
  outputSchema: z.object({
    existingTitles: z.array(z.string()),
    count: z.number(),
  }),
  execute: async ({ blogId }, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(`🔍 [checkExistingArticlesTool] Kiểm tra bài viết đã có trong blog ${blogId}...`);

    const response = await fetch(
      shopifyUrl(`/blogs/${blogId}/articles.json?limit=250`),
      { headers: shopifyHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Shopify articles API error: ${response.status}`);
    }

    const data = await response.json() as { articles: any[] };
    const articles = data.articles || [];
    const titles = articles.map((a: any) => a.title.toLowerCase().trim());

    logger?.info(`✅ [checkExistingArticlesTool] Tìm thấy ${titles.length} bài viết đã tồn tại`);

    return {
      existingTitles: titles,
      count: titles.length,
    };
  },
});

export const publishArticleTool = createTool({
  id: "publish-article",
  description: "Đăng bài viết SEO lên Shopify blog. Kiểm tra trùng lặp trước khi đăng.",
  inputSchema: z.object({
    blogId: z.number().describe("ID của blog Shopify"),
    title: z.string().describe("Tiêu đề bài viết"),
    bodyHtml: z.string().describe("Nội dung bài viết dạng HTML"),
    tags: z.string().describe("Tags của bài viết, phân cách bằng dấu phẩy"),
    existingTitles: z.array(z.string()).describe("Danh sách tiêu đề bài viết đã tồn tại"),
  }),
  outputSchema: z.object({
    published: z.boolean(),
    articleId: z.number().optional(),
    articleTitle: z.string(),
    skipped: z.boolean(),
    reason: z.string().optional(),
  }),
  execute: async ({ blogId, title, bodyHtml, tags, existingTitles }, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(`📝 [publishArticleTool] Chuẩn bị đăng bài: "${title}"`);

    const titleLower = title.toLowerCase().trim();
    if (existingTitles.includes(titleLower)) {
      logger?.info(`⚠️ [publishArticleTool] Bỏ qua - Bài viết đã tồn tại: "${title}"`);
      return {
        published: false,
        articleTitle: title,
        skipped: true,
        reason: "Bài viết đã tồn tại",
      };
    }

    const response = await fetch(shopifyUrl(`/blogs/${blogId}/articles.json`), {
      method: "POST",
      headers: shopifyHeaders(),
      body: JSON.stringify({
        article: {
          title,
          author: "GPS Guides",
          tags,
          body_html: bodyHtml,
          published: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger?.error(`❌ [publishArticleTool] Lỗi khi đăng bài: ${response.status} ${errText}`);
      throw new Error(`Shopify publish article error: ${response.status} ${errText}`);
    }

    const data = await response.json() as { article: any };
    logger?.info(`✅ [publishArticleTool] Đăng bài thành công! ID: ${data.article.id}, Tiêu đề: "${title}"`);

    return {
      published: true,
      articleId: data.article.id,
      articleTitle: title,
      skipped: false,
    };
  },
});
