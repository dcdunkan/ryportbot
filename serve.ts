import { serve, webhookCallback } from "./deps.ts";
import { bot, TOKEN } from "./bot.ts";

const handleUpdate = webhookCallback(bot, "std/http");

serve(async (req) => {
  if (new URL(req.url).pathname === `/${TOKEN}` && req.method === "POST") {
    if (req.method === "POST") {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error(err);
        return new Response();
      }
    }
  }

  return Response.redirect(`https://telegram.me/${bot.botInfo.username}`);
});
