import type { ExecutionContext } from '@cloudflare/workers-types';

export interface Env {
  WEBHOOK_URL: string;
  WEBHOOK_TOKEN: string;
  SITE_PASSWORD?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/wake") {
      return wakeDobby(request, env);
    }

    // Статические файлы из public/ автоматически через env.ASSETS
    if (request.method === "GET") {
      try {
        const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = await env.ASSETS.fetch(new Request(new URL(filePath, request.url)));
        if (file.ok) {
          return file;
        }
      } catch {
        // Игнорируем ошибки
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function wakeDobby(request: Request, env: Env): Promise<Response> {
  try {
    // Проверка пароля
    const body = await request.json() as { password?: string };
    const { password } = body;

    if (env.SITE_PASSWORD) {
      if (!password || password !== env.SITE_PASSWORD) {
        return new Response(JSON.stringify({ error: "wrong password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const { WEBHOOK_URL, WEBHOOK_TOKEN } = env;

    if (!WEBHOOK_URL || !WEBHOOK_TOKEN) {
      return new Response("Server not configured", { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WEBHOOK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Добби, проснись! Это Макс (с сайта)" }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    const status = response.status;

    return new Response(
      JSON.stringify({ status, body: text }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return new Response(
        JSON.stringify({ status: 504, body: 'Timeout: Webhook request timed out' }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: 502, body: 'Bad Gateway: Webhook request failed' }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
