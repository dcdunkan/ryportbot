import { bot } from "./bot.ts";
import { run } from "https://deno.land/x/grammy_runner@v1.0.4/mod.ts";

run(bot);
console.log(`running @${bot.botInfo.username}`);
