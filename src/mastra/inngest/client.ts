import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

// Use development configuration when NODE_ENV is not "production"
export const inngest = new Inngest(
  process.env.NODE_ENV === "production"
    ? {
        id: "shopify-seo-blog-agent",
        name: "Shopify SEO Blog Agent",
      }
    : {
        id: "mastra",
        baseUrl: "http://localhost:3000",
        isDev: true,
        middleware: [realtimeMiddleware()],
      },
);
