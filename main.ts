import { bot } from "./bot.ts";
import { run } from "./deps.ts";

run(bot);
console.log(`running @${bot.botInfo.username}`);
