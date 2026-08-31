import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import open from "open";
import { API_BASE_URL } from "./config.js";
import { type Credentials, saveCredentials } from "./credentials.js";

const TIMEOUT_MS = 120_000;

export async function login(tokenDirect?: string): Promise<void> {
  if (tokenDirect) {
    saveCredentials({ access_token: tokenDirect, user_id: "", email: "" });
    console.log(JSON.stringify({ success: true, message: "Token saved" }));
    return;
  }

  const state = randomUUID();

  return new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": new URL(API_BASE_URL).origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/callback") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as Credentials & {
              state: string;
              session_token?: string;
            };

            if (data.state !== state) {
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": new URL(API_BASE_URL).origin,
              });
              res.end(JSON.stringify({ error: "State mismatch" }));
              return;
            }

            saveCredentials({
              access_token: data.access_token,
              session_token: data.session_token,
              user_id: data.user_id,
              email: data.email,
            });

            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": new URL(API_BASE_URL).origin,
            });
            res.end(JSON.stringify({ success: true }));

            console.log(
              JSON.stringify({
                success: true,
                email: data.email,
                message: "Login successful",
              }),
            );

            server.close();
            resolve();
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid request" }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start local server"));
        return;
      }

      const port = addr.port;
      const authUrl = `${API_BASE_URL}/auth/cli?port=${port}&state=${state}`;

      console.log(
        JSON.stringify({
          message: "Opening browser for login...",
          url: authUrl,
        }),
      );

      open(authUrl).catch(() => {
        console.log(
          JSON.stringify({
            message: "Could not open browser. Please visit this URL manually:",
            url: authUrl,
          }),
        );
      });
    });

    const timer = setTimeout(() => {
      server.close();
      console.log(JSON.stringify({ error: "Login timed out" }));
      process.exit(1);
    }, TIMEOUT_MS);

    server.on("close", () => clearTimeout(timer));
  });
}
