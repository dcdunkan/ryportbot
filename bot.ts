import {
  Bot,
  ChatTypeContext,
  CommandContext,
  Filter,
  freeStorage,
  Fuse,
  getTimeZones,
  InlineKeyboard,
  lazySession,
  timeZonesNames,
} from "./deps.ts";
import {
  _24to12,
  getDisplayTime,
  getRandomReply,
  getUserTime,
  hoursKeyboard,
  HTML,
  isAvailable,
  nonAdmins,
  REPORT_BOT_REPLIES,
  UNAVAIL_KEYBOARD1,
} from "./helpers.ts";
import { Context, customMethods, SessionData } from "./context.ts";

export const TOKEN = Deno.env.get("BOT_TOKEN");
if (!TOKEN) throw new Error("BOT_TOKEN is missing");
export const bot = new Bot<Context>(TOKEN);

const storage = freeStorage<SessionData>(bot.token);
bot.use(lazySession({ storage, initial: () => ({ dnd: false }) }));
bot.use(customMethods);
bot.catch(console.error);
// Assign some always-use-parameters to the payload.
bot.api.config.use((prev, method, payload, signal) =>
  prev(method, { ...payload, disable_web_page_preview: true }, signal)
);

const pm = bot.chatType("private");
const grp = bot.chatType(["group", "supergroup"]);
const exceptChannel = bot.chatType(["private", "group", "supergroup"]);

type GroupContext = ChatTypeContext<Context, "group" | "supergroup">;

async function reportHandler(
  ctx:
    | CommandContext<GroupContext>
    | Filter<
      GroupContext,
      "msg:entities:mention" | "msg:caption_entities:mention"
    >,
) {
  if (!ctx.msg.reply_to_message) {
    return await ctx.comment("Reply /report to a message.");
  }

  const from = ctx.msg.reply_to_message.from!;
  if (from.id === ctx.me.id) {
    return await ctx.comment(getRandomReply(REPORT_BOT_REPLIES));
  }
  const member = await ctx.getChatMember(from.id);
  if (member.status === "administrator" || member.status === "creator") {
    return;
  }

  let msg = `Reported <a href="${
    from.is_bot
      ? `https://telegram.me/${from.username}`
      : `tg://user?id=${from.id}`
  }">${from.first_name}</a> [<code>${from.id}</code>] to admins.\n`;

  let availableAdmins = 0;
  const admins = await ctx.getChatAdministrators();

  await Promise.all(admins.map(async (admin) => {
    if (admin.is_anonymous || admin.user.is_bot) return;
    const user = await storage.read(`${admin.user.id}`);
    if (user) {
      if (user.dnd) return;
      if (
        user.interval !== undefined && user.tz !== undefined &&
        !isAvailable(user)
      ) {
        return; // Admin is currently unavailable as per the timezone and interval they set.
      }
    }

    availableAdmins++;
    msg += admin.user.username
      ? `@${admin.user.username} `
      : `<a href="tg://user?id=${admin.user.id}">${admin.user.first_name}</a> `;
  }));

  // If all admins are unavailable at the moment, just tag the chat creator.
  if (availableAdmins === 0) {
    const creator = admins.find((admin) => admin.status === "creator");
    // There might be no creator or the admins are anonymous.
    if (creator) {
      msg += creator.user.username
        ? `@${creator.user.username} `
        : `<a href="tg://user?id=${creator.user.id}">${creator.user.first_name}</a> `;
    }
  }

  await ctx.comment(msg, "HTML");
}

grp.filter(nonAdmins).command(["report", "admin"], reportHandler);
grp.on(["msg:entities:mention", "msg:caption_entities:mention"])
  .filter(nonAdmins).filter((ctx) => {
    const text = (ctx.msg.text ?? ctx.msg.caption)!;
    return (ctx.msg.entities ?? ctx.msg.caption_entities)
      .find((e) => {
        const t = text.slice(e.offset, e.offset + e.length);
        return e.type === "mention" && (t === "@admin" || t === "@admins");
      }) !== undefined;
  })
  .use(reportHandler);

// the following also works. but not as good as the above filtering.
// grp.hears(/.*(\s|^)(@admins?)\b.*/g, reportHandler);

pm.command(["report", "admin"], async (ctx) => {
  await ctx.reply("That works only in groups.");
});

pm.command(["tz", "timezone"], async (ctx) => {
  const session = await ctx.session;
  const statusText = session.tz
    ? `You have set <b>${session.tz}</b> as your timezone. Use /clear_tz to remove it.`
    : `You haven't configured a timezone yet. \
You can find your timezone location by going <a href="https://tzone.deno.dev">here</a>, or by searching one.`;

  if (!ctx.match) {
    return await ctx.reply(
      `Pass your timezone as an argument.
Examples
- <code>/tz Europe/Berlin</code>
- <code>/tz berlin</code>
- <code>/tz berl</code> (Search)

${statusText}

<b>Timezone</b>
You can set a <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones">timezone</a>, and I won't tag you for reports while you're unavailable. \
By default, you're considered to be unavailable, if it is night time at your location. \
You can customize the default unavailability period (12AM to 6AM) using the /unavail command.`,
      HTML,
    );
  }

  const timezone = ctx.match.trim();
  if (timezone.length === 1) {
    return await ctx.reply(
      "What is this? Specify your timezone a little bit more. At least two characters.",
    );
  }

  // this should never be a global constant since timezone
  // offset can change due to DST.
  const timezones = getTimeZones();

  if (timeZonesNames.includes(timezone)) {
    const tz = timezones.find((tz) => tz.group.includes(timezone));
    // it is assured that there will be one. But still its nice to catch every case.
    if (!tz) {
      return await ctx.answerCallbackQuery("Couldn't find the timezone");
    }

    if (!session.interval) session.interval = [0, 6]; // 12AM to 6AM
    ctx.session = {
      ...session,
      tz: timezone, // never store offset!
    };

    const userTime = getUserTime(tz.currentTimeOffsetInMinutes);
    return await ctx.reply(
      `Timezone location has been set to <b>${timezone}</b>. \
I guess the time is ${getDisplayTime(userTime)} at your place.`,
      HTML,
    );
  }

  const results = new Fuse(timezones, {
    findAllMatches: true,
    minMatchCharLength: timezone.length,
    threshold: 0.5,
    keys: ["group", "countryName", "mainCities"],
  }).search(timezone).splice(0, 100);

  // invalid
  if (!results.length) {
    return await ctx.reply(
      "Couldn't find any timezones related to that. Please enter something valid.",
    );
  }

  const kb = new InlineKeyboard();
  for (let i = 0; i < results.length; i++) {
    const { item } = results[i];
    kb.text(item.name, `set-loc_${item.name}`);
    if (i % 2 === 1) kb.row();
  }

  return await ctx.reply(`Did you mean...?`, { reply_markup: kb });
});

pm.callbackQuery(/set-loc_(.+)/, async (ctx) => {
  if (!ctx.match) {
    return await ctx.answerCallbackQuery("Invalid query :(");
  }

  const session = await ctx.session;
  await ctx.answerCallbackQuery();
  const location = ctx.match[1];
  const tz = getTimeZones().find((tz) => tz.group.includes(location));
  if (!tz) {
    return await ctx.answerCallbackQuery("Couldn't find the timezone");
  }

  if (!session.interval) session.interval = [0, 6]; // 12AM to 6AM
  ctx.session = {
    ...session,
    tz: location,
  };

  const userTime = getUserTime(tz.currentTimeOffsetInMinutes);
  await ctx.editMessageText(
    `Timezone location has been set to <b>${location}</b>. \
I guess the time is ${getDisplayTime(userTime)} at your place.`,
    HTML,
  );
});

pm.command("clear_tz", async (ctx) => {
  const session = await ctx.session;
  ctx.session = {
    ...session,
    tz: undefined,
    interval: undefined,
  };
  await ctx.reply(
    "Timezone has been cleared. You can set a new one using the /tz command.",
  );
});

pm.command("dnd", async (ctx) => {
  const dnd = (await ctx.session).dnd;
  (await ctx.session).dnd = !dnd;
  await ctx.reply(
    !dnd
      ? "Enabled Do Not Disturb mode. You won't receive any mentions until you disable it using /dnd again."
      : "Disabled Do Not Disturb mode. You'll receive reports when you're available.",
  );
});

// Unavailability feature
pm.command("unavail", async (ctx) => {
  const { interval, tz } = await ctx.session;
  if (!tz) {
    return await ctx.reply(
      "You need to set a timezone using /tz to use this feature.",
    );
  }

  const statusText = interval
    ? `Your current unavailability time period is \
<b>from ${_24to12(interval[0])} to ${_24to12(interval[1])}</b>. \
You can change it using the button below.`
    : `You have disabled this feature entirely. You can enable it using the button below.`;

  await ctx.reply(
    `${statusText}

In your daily life, you're probably not be available 24x7. You need sleep, and you may have work. \
So while you're unavailable, it is a disturbance if the bot tags you when people /report. \
With this feature you can set a time period during which you are expected to be unavailable. \
If such an unavailability period is set, the bot will check if you're available or not before tagging you.

<b>Note</b>: This feature won't work if you're the chat creator and no other admins are available.

— You can disable this feature with /disable_unavail and receive mentions all the time.
— Run /am_i_available to check if you are available now or not. (debug)`,
    {
      ...HTML,
      reply_markup: new InlineKeyboard()
        .text(interval ? "Change" : "Enable", "change-unavail-time"),
    },
  );
});

pm.callbackQuery("change-unavail-time", async (ctx) => {
  const session = await ctx.session;
  if (!session.tz) {
    return await ctx.alert(
      "You need to set a timezone using the /tz command first to use this feature.",
    );
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "So you're unavailable, starting from?",
    { reply_markup: UNAVAIL_KEYBOARD1 },
  );
});

pm.callbackQuery(/unavail-time-start_(\d+)/, async (ctx) => {
  if (!ctx.match) {
    return await ctx.answerCallbackQuery("Invalid query :(");
  }
  const session = await ctx.session;
  if (!session.tz) {
    return await ctx.alert(
      "You need to set a timezone using the /tz command first to use this feature.",
    );
  }
  const startsAt = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery(`From ${_24to12(startsAt)}, to...`);
  const kb = hoursKeyboard(startsAt + 1, `unavail-time-end_${startsAt}`, false);
  await ctx.editMessageText("When you become available again?", {
    reply_markup: kb,
  });
});

pm.callbackQuery(/unavail-time-end_(\d+)_(\d+)/, async (ctx) => {
  if (!ctx.match) {
    return await ctx.answerCallbackQuery("Invalid query :(");
  }
  const session = await ctx.session;
  if (!session.tz) {
    return await ctx.alert(
      "You need to set a timezone using the /tz command first to use this feature.",
    );
  }
  await ctx.answerCallbackQuery();
  const startsAt = parseInt(ctx.match[1]);
  const endsAt = parseInt(ctx.match[2]);
  (await ctx.session).interval = [startsAt, endsAt];
  await ctx.editMessageText(
    `So you'll be unavailable from ${_24to12(startsAt)} to ${_24to12(endsAt)}. \
I'll remember that and I won't tag you at that time unless it is necessary.`,
  );
});

pm.command("disable_unavail", async (ctx) => {
  if ((await ctx.session).interval === undefined) {
    return await ctx.reply("Already disabled.");
  }
  (await ctx.session).interval = undefined;
  return await ctx.reply("Unavailability feature have been disabled.", {
    reply_markup: new InlineKeyboard()
      .text("Enable it back", "change-unavail-time"),
  });
});

pm.command("am_i_available", async (ctx) => {
  const session = await ctx.session;
  let msg = !session.tz
    ? "I don't know. You haven't set any timezone yet. So, I can't really tell."
    : session.interval
    ? `Seems like you are ${
      isAvailable(session) ? "" : "un"
    }available right now.`
    : "Not sure about it since you disabled the /unavail-ability feature.";

  if (session.dnd) {
    msg += session.interval && !isAvailable(session)
      ? " And you also have /dnd enabled."
      : " But you have /dnd enabled right now. So, I guess you're unavailable rn.";
  }
  await ctx.reply(msg);
});

exceptChannel.command("start", async (ctx) => {
  const { tz } = await ctx.session;
  const helpText = tz
    ? ""
    : "\nIn order to do that, I need your /timezone. You can simply set one by using /tz. \
So I can decide whether you are available or not based on your /unavail-ability time period and timezone, before mentioning you. \
I also help you to go to Do Not Disturb mode (/dnd), which makes you fully unavailable until you disable it.\n";

  await ctx.reply(
    ctx.chat.type !== "private"
      ? "Hi! For /help, ping me in private."
      : `Hi! I can mention admins in a group chat when someone reports something. \
But, unlike other bots which do the same thing, I only tag you when you're available.
${helpText}
See /help for more information.`,
  );
});

exceptChannel.command("help", async (ctx) => {
  await ctx.reply(
    ctx.chat.type !== "private"
      ? "Use /report to report someone to admins. Ping me in private for more help."
      : `Add me to your group so I can help your group members to /report other members (such as spammers, etc) to the admins of the group. \
I'm different from other bots which does the same because I'm aware of time!

<b>How am I time-aware?</b>
Well, I am not actually time-aware without you setting your /timezone. \
If you set one, an unavailability time period is also set (which you can customize using /unavail). \
That's it! From then on, whenever someone use the /report command in a group that you're admin, \
I'll check your current time, and if you're unavailable, I won't mention you.

<b>Note</b>: No matter how busy you are, you will receive mentions if you're the chat creator and if no other admins are available at the moment.

<b>Do Not Disturb mode</b>
You can enable or disable the <i>Do Not Disturb</i> mode using /dnd. \
When you have it enabled, the bot won't mention you at all.

<b>About</b>
The idea: https://t.me/grammyjs/63768
https://github.com/dcdunkan/ryportbot
By @dcdunkan from @dcbots.`,
    HTML,
  );
});

await bot.init();
await bot.api.setMyCommands([
  { command: "tz", description: "Set timezone" },
  { command: "clear_tz", description: "Clear timezone" },
  { command: "unavail", description: "Set unavailability time period" },
  { command: "dnd", description: "Toggle Do Not Disturb mode" },
  { command: "am_i_available", description: "Am I available?" },
  { command: "help", description: "Help & About" },
], { scope: { type: "all_private_chats" } });
