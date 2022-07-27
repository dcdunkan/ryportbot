import { serve, webhookCallback } from "./deps.ts";
import { bot, TOKEN } from "./bot.ts";

const handleUpdate = webhookCallback(bot, "std/http");

serve(async (req) => {
  const pathname = new URL(req.url).pathname;
  switch (pathname) {
    case `/${TOKEN}`:
      if (req.method === "POST") {
        try {
          return await handleUpdate(req);
        } catch (err) {
          console.error(err);
          return new Response();
        }
      }
      break;
    default:
      return Response.redirect(`https://telegram.me/${bot.botInfo.username}`);
  }
});
