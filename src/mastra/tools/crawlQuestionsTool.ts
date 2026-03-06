import { createTool } from "@mastra/core/tools";
import { z } from "zod";

async function callOpenAI(prompt: string): Promise<string> {
  const useStandardOpenAI = !!process.env.OPENAI_API_KEY;
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  const baseURL = useStandardOpenAI
    ? "https://api.openai.com/v1"
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  // Chat completions API (standard — works with OPENAI_API_KEY and Replit AI Integration)
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text;
    }
  } catch {
    // fall through to responses API (Replit-only fallback)
  }

  if (useStandardOpenAI) {
    throw new Error("OpenAI chat/completions failed");
  }

  // Fallback: Replit AI Integration responses API format
  const replitBase = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "").replace(/\/$/, "");
  const res2 = await fetch(`${replitBase}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "gpt-5", input: prompt }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res2.ok) {
    const errText = await res2.text();
    throw new Error(`OpenAI API error ${res2.status}: ${errText}`);
  }

  const data2 = await res2.json();
  return data2.output?.[0]?.content?.[0]?.text || data2.output_text || data2.text || "";
}

async function fetchRedditRSS(query: string): Promise<string[]> {
  const urls = [
    `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=top&t=year&limit=20`,
    `https://www.reddit.com/r/gps/search.rss?q=${encodeURIComponent(query)}&sort=top&restrict_sr=1`,
    `https://www.reddit.com/r/caradvice/search.rss?q=${encodeURIComponent(query)}&sort=top&restrict_sr=1`,
  ];

  const questions: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept: "application/rss+xml, text/xml",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const text = await res.text();

      const cdataMatches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
      for (const match of cdataMatches) {
        const title = match[1]?.trim();
        if (title && title.length > 15 && title.length < 250 && !title.includes("reddit.com")) {
          questions.push(title);
        }
      }

      const tagMatches = text.matchAll(/<title>(.*?)<\/title>/g);
      for (const match of tagMatches) {
        const title = match[1]
          ?.replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
        if (
          title &&
          title.length > 15 &&
          title.length < 250 &&
          !title.toLowerCase().includes("reddit") &&
          !title.toLowerCase().includes("search")
        ) {
          questions.push(title);
        }
      }

      if (questions.length > 0) break;
    } catch {
      continue;
    }
  }

  return [...new Set(questions)].slice(0, 15);
}

export const crawlRedditQuestionsTool = createTool({
  id: "crawl-reddit-questions",
  description: "Crawl câu hỏi thật về GPS tracker từ Reddit để làm chủ đề bài viết SEO có search intent cao.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    questions: z.array(z.string()),
    source: z.literal("reddit"),
    count: z.number(),
  }),
  execute: async (_input, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info("🔍 [crawlRedditQuestionsTool] Crawl câu hỏi GPS tracker từ Reddit...");

    const queries = ["gps tracker car", "vehicle gps tracker", "anti theft gps", "car tracking device"];
    const allQuestions: string[] = [];

    for (const query of queries) {
      try {
        const questions = await fetchRedditRSS(query);
        allQuestions.push(...questions);
        logger?.info(`📝 [crawlRedditQuestionsTool] "${query}": ${questions.length} kết quả`);
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        logger?.warn(`⚠️ [crawlRedditQuestionsTool] Lỗi "${query}": ${err}`);
      }
    }

    const unique = [...new Set(allQuestions)]
      .filter((q) => q.length > 15 && q.length < 300)
      .slice(0, 25);

    logger?.info(`✅ [crawlRedditQuestionsTool] Reddit: ${unique.length} câu hỏi`);
    return { questions: unique, source: "reddit" as const, count: unique.length };
  },
});

export const crawlQuoraQuestionsTool = createTool({
  id: "crawl-quora-questions",
  description: "Tạo danh sách câu hỏi thật từ Quora/forums về GPS tracker dựa trên search intent patterns.",
  inputSchema: z.object({
    redditQuestions: z.array(z.string()).describe("Câu hỏi đã có từ Reddit để tránh trùng lặp"),
  }),
  outputSchema: z.object({
    questions: z.array(z.string()),
    source: z.literal("quora"),
    count: z.number(),
  }),
  execute: async ({ redditQuestions }, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info("🔍 [crawlQuoraQuestionsTool] Tạo câu hỏi GPS từ Quora/forum patterns...");

    const redditContext =
      redditQuestions.length > 0
        ? `\nALREADY COVERED BY REDDIT:\n${redditQuestions.slice(0, 10).join("\n")}`
        : "";

    const prompt = `You are an SEO researcher who has studied thousands of real GPS tracker questions from Quora, Reddit, forums, and Google's "People Also Ask" sections.

Generate 20 REAL questions that actual people ask about GPS trackers online. These should match what users literally type into search engines and ask on Q&A sites.${redditContext}

Include a diverse mix:
- Buying decisions: "What is the best GPS tracker for...?"
- How-to: "How do I...?"
- Troubleshooting: "Why is my GPS tracker...?"
- Comparisons: "GPS tracker vs...?"
- Legal/privacy: "Is it legal to...?"
- Technical: "How long does battery last...?"
- Specific use cases: family, fleet, stolen cars, motorcycles

Return ONLY a JSON array of 20 question strings:
["question 1", "question 2", ...]

Make questions sound natural and conversational, exactly as someone would type them.`;

    let questions: string[] = [];
    try {
      const text = await callOpenAI(prompt);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]).filter(
          (q: any) => typeof q === "string" && q.length > 15 && q.length < 250
        );
      }
    } catch (err) {
      logger?.warn(`⚠️ [crawlQuoraQuestionsTool] Lỗi gọi AI: ${err}`);
    }

    logger?.info(`✅ [crawlQuoraQuestionsTool] Tạo được ${questions.length} câu hỏi từ Quora patterns`);
    return { questions, source: "quora" as const, count: questions.length };
  },
});

export const selectBestQuestionsTool = createTool({
  id: "select-best-questions",
  description: "Phân tích và chọn câu hỏi có tiềm năng SEO cao nhất từ Reddit/Quora, không trùng với bài đã có.",
  inputSchema: z.object({
    redditQuestions: z.array(z.string()),
    quoraQuestions: z.array(z.string()),
    existingTitles: z.array(z.string()),
    count: z.number(),
  }),
  outputSchema: z.object({
    selectedQuestions: z.array(
      z.object({
        question: z.string(),
        source: z.string(),
        seoTitle: z.string(),
        targetKeyword: z.string(),
      })
    ),
    count: z.number(),
  }),
  execute: async ({ redditQuestions, quoraQuestions, existingTitles, count }, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `🔍 [selectBestQuestionsTool] Chọn ${count} câu hỏi tốt nhất từ ${redditQuestions.length + quoraQuestions.length} câu hỏi...`
    );

    const allQuestions = [
      ...redditQuestions.map((q) => ({ q, source: "Reddit" })),
      ...quoraQuestions.map((q) => ({ q, source: "Quora" })),
    ];

    if (allQuestions.length === 0) {
      return { selectedQuestions: [], count: 0 };
    }

    const prompt = `You are an SEO expert for a GPS tracker online store.

REAL USER QUESTIONS (from Reddit & Quora):
${allQuestions.map((item, i) => `${i + 1}. [${item.source}] ${item.q}`).join("\n")}

EXISTING ARTICLE TITLES (do NOT create similar topics):
${existingTitles.slice(0, 25).join("\n") || "None yet"}

Select the BEST ${count} questions for GPS tracker blog articles.

Selection criteria:
1. High search volume potential (specific, practical questions people Google)
2. GPS tracker related ONLY (no off-topic questions)
3. NOT similar to existing article titles
4. Mix of: buying guides, how-to, comparisons, use cases, troubleshooting

Return EXACTLY ${count} selected questions as JSON array:
[
  {
    "question": "the original question from Reddit/Quora",
    "source": "Reddit or Quora",
    "seoTitle": "SEO-optimized blog title that answers this question (include year 2025 or 2026 where relevant)",
    "targetKeyword": "3-5 word main keyword phrase"
  }
]

Return ONLY the JSON array.`;

    let selected: any[] = [];
    try {
      const text = await callOpenAI(prompt);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger?.warn("⚠️ [selectBestQuestionsTool] Không parse được JSON");
        return { selectedQuestions: [], count: 0 };
      }
      selected = JSON.parse(jsonMatch[0]);
    } catch (err) {
      logger?.warn(`⚠️ [selectBestQuestionsTool] Lỗi gọi AI: ${err}`);
      return { selectedQuestions: [], count: 0 };
    }

    logger?.info(`✅ [selectBestQuestionsTool] Đã chọn ${selected.length} câu hỏi SEO:`);
    selected.forEach((q: any, i: number) => {
      logger?.info(`  ${i + 1}. [${q.source}] "${q.seoTitle}"`);
    });

    return { selectedQuestions: selected, count: selected.length };
  },
});
