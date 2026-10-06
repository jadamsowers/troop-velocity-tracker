import type { Plugin } from "vite";
import { authenticate } from "../login-helper/scouting.mjs";

const MAX_BODY_BYTES = 4096;

/**
 * Dev-server twin of the production `POST /api/login` in
 * login-helper/server.mjs, sharing the same scouting.org authenticate call so
 * `npm run dev` signs in exactly like the container does. Credentials are
 * forwarded and never logged.
 */
export default function scoutbookLoginPlugin(): Plugin {
  return {
    name: "vite-plugin-scoutbook-login",
    configureServer(server) {
      server.middlewares.use("/api/login", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") {
          send(405, { error: "Method not allowed." });
          return;
        }

        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            send(413, { error: "Request body too large." });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", async () => {
          if (res.headersSent) return;
          let body: { username?: unknown; password?: unknown };
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            send(400, { error: "Invalid JSON body." });
            return;
          }
          const result = await authenticate({
            username: body.username,
            password: body.password,
          });
          send(result.status, result.body);
        });
      });
    },
  };
}
