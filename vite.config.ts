import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function streamProxyPlugin() {
  const handler = async (req: any, res: any) => {
    if (!req.url?.startsWith("/api/stream")) {
      return false;
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const target = requestUrl.searchParams.get("url");

    if (!target || !/^https?:\/\//i.test(target)) {
      res.statusCode = 400;
      res.end("Missing or invalid stream url");
      return true;
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        "user-agent": req.headers["user-agent"] || "Mozilla/5.0",
        "icy-metadata": "1",
      };

      if (typeof req.headers.range === "string" && req.headers.range.length > 0) {
        upstreamHeaders.range = req.headers.range;
      }

      const upstream = await fetch(target, {
        headers: upstreamHeaders,
      });

      if (!upstream.body) {
        res.statusCode = 502;
        res.end("No upstream body");
        return true;
      }

      res.statusCode = upstream.status;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");

      const copyHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "icy-br",
        "icy-name",
        "icy-genre",
      ];

      for (const header of copyHeaders) {
        const value = upstream.headers.get(header);
        if (value) {
          res.setHeader(header, value);
        }
      }

      // Convert Web ReadableStream to Node stream so Vite middleware can pipe it.
      const { Readable } = await import("node:stream");
      Readable.fromWeb(upstream.body as any).pipe(res);
      return true;
    } catch {
      res.statusCode = 502;
      res.end("Stream proxy error");
      return true;
    }
  };

  return {
    name: "stream-proxy-plugin",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const handled = await handler(req, res);
        if (!handled) {
          next();
        }
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const handled = await handler(req, res);
        if (!handled) {
          next();
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/online_radio/" : "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), streamProxyPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
