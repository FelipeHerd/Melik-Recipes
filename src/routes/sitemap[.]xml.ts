import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://melik-recipes.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const routeOptions = {
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/melik-bakery", changefreq: "weekly", priority: "0.9" },
          { path: "/descubrir", changefreq: "weekly", priority: "0.7" },
          { path: "/chef", changefreq: "weekly", priority: "0.8" },
          { path: "/auth", changefreq: "monthly", priority: "0.5" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
};

// The `server` block is added to route options via a module augmentation in
// `@tanstack/start-client-core/serverRoute`, but that augmentation is re-exported
// with `export type *` and isn't picked up by the type checker here. Cast to
// bypass the excess-property check — the runtime shape is correct.
export const Route = createFileRoute("/sitemap.xml")(routeOptions as never);
