# report bot

> Built using [grammY](https://grammy.dev).

Simple time-aware report bot for Telegram. It listens for /report, /admin
commands or @admin, @admins mentions in groups, and mentions all admins. Admins
can set their timezone and unavailability time period in the bot's PM and only
receive mentions when they are available.

Working instance (public): [@ryportbot](https://telegram.me/ryportbot)

To run locally, make sure you have installed [Deno CLI](https://deno.land).

```sh
git clone https://github.com/dcdunkan/ryportbot.git
cd ryportbot
BOT_TOKEN="<YOUR-TOKEN>" deno run --allow-net --allow-env main.ts
```

Talk to [BotFather](https://t.me/botfather), and get yourself a `BOT_TOKEN`.

Click
[here](https://dash.deno.com/new?url=https://raw.githubusercontent.com/dcdunkan/ryportbot/main/serve.ts&env=BOT_TOKEN)
to deploy your own instance to Deno Deploy.
