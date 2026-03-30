import type { Plugin } from "vite";
import { spawn } from "child_process";
import { join } from "path";

export default function scoutbookLoginPlugin(): Plugin {
  let activeChild: ReturnType<typeof spawn> | null = null;

  return {
    name: "vite-plugin-scoutbook-login",
    configureServer(server) {
      // POST /api/login — spawns browser-login.mjs, streams back { token, units }
      server.middlewares.use("/api/login", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        // Kill any previous login process
        if (activeChild) {
          activeChild.kill();
          activeChild = null;
        }

        res.setHeader("Content-Type", "application/json");

        const scriptPath = join(
          process.cwd(),
          "scripts",
          "browser-login.mjs",
        );

        console.log("[scoutbook-login] Spawning browser login process…");
        const child = spawn("node", [scriptPath], {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
        });
        activeChild = child;

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          // Forward stderr to Vite console for debugging
          process.stderr.write(chunk);
        });

        child.on("close", (code) => {
          if (activeChild === child) activeChild = null;

          // Find the last JSON line in stdout (the script's output)
          const lines = stdout.trim().split("\n");
          const jsonLine = lines[lines.length - 1] || "";

          try {
            const result = JSON.parse(jsonLine);
            if (result.error) {
              res.writeHead(code === 0 ? 400 : 500);
            } else {
              res.writeHead(200);
            }
            res.end(JSON.stringify(result));
          } catch {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error:
                  stderr.trim() ||
                  `Login process exited with code ${code}`,
              }),
            );
          }

          console.log(
            `[scoutbook-login] Login process exited (code ${code})`,
          );
        });

        child.on("error", (err) => {
          if (activeChild === child) activeChild = null;
          console.error("[scoutbook-login] Spawn error:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}
