import {
  ChatTypeContext,
  Filter,
  getTimeZones,
  InlineKeyboard,
  Message,
} from "./deps.ts";
import { Context, SessionData } from "./context.ts";

// Constants
// Random replies if someone reports the bot itself.
export const REPORT_BOT_REPLIES = [
  "You can't report me.",
  "Nice try",
  "Oh, come on.",
  "what?",
  "Hmm",
  "Nope",
];
export const UNAVAIL_KEYBOARD1 = hoursKeyboard(0, "unavail-time-start");

// Helpers
export function getUserTime(offset: number) {
  const time = new Date();
  const t = time.getTime() + (time.getTimezoneOffset() * 60000) +
    (offset * 60000);
  return new Date(t);
}

export function getDisplayTime(time: Date) {
  return `${time.getHours().toString().padStart(2, "0")}:${
    time.getMinutes().toString().padStart(2, "0")
  }`;
}

// what a weird hack
function checkIfInBetween(offset: number, start: number, end: number) {
  let hours = getUserTime(offset).getHours();
  if (start > hours) hours += 24;
  // it is made sure that start and end will never be equal
  return start < end
    ? hours >= start && hours < end // case 7AM to 6PM (7 to 18)
    : hours >= start && hours < (end + 24); // cases like 11PM to 6AM (23 to 6)
}

export function isAvailable({ tz, interval }: SessionData) {
  // If anyone haven't set anything, then consider as they are available.
  if (!tz || !interval) return true;
  const offset = getTimeZones().find((t) => t.group.includes(tz))
    ?.currentTimeOffsetInMinutes!; // why? DST!!
  return !checkIfInBetween(offset, interval[0], interval[1]);
}

export function getRandomReply(replies: string[]) {
  return replies[Math.floor(Math.random() * replies.length)];
}

// this is ultra weird
export function hoursKeyboard(
  startsAt: number,
  prefix: string,
  includeLast = true,
) {
  const kb = new InlineKeyboard();
  let actualIndex = 0;
  let limit = (includeLast ? 25 : 24);
  if (startsAt === 24) {
    startsAt = 0;
    limit--;
  }
  for (let i = startsAt; i < limit; i++) {
    kb.text(_24to12(i), `${prefix}_${i}`);
    if (i === 23) {
      i = -1; // -1? i gets incremented to 0 in the next iteration.
      limit = startsAt - 1;
    }
    actualIndex++;
    if (actualIndex % 4 === 0) kb.row();
  }
  return kb;
}

export function _24to12(x: number) {
  while (x > 23) x -= 24;
  return x === 0
    ? "12 AM"
    : x > 11 && x < 24
    ? (x === 12 ? 12 : x - 12).toString().padStart(2, "0") + " PM"
    : x.toString().padStart(2, "0") + " AM";
}

export function getUser(msg: Message) {
  return msg.sender_chat?.type === "channel"
    ? {
      first_name: msg.sender_chat.title,
      id: msg.sender_chat.id,
      username: msg.sender_chat.username,
      is_user: false,
    }
    : msg.sender_chat?.type === "group"
    ? {
      first_name: msg.sender_chat.title,
      id: msg.sender_chat.id,
      username: undefined,
      is_user: false,
    }
    : msg.sender_chat?.type === "supergroup"
    ? {
      first_name: msg.sender_chat.title,
      id: msg.sender_chat.id,
      username: msg.sender_chat.username,
      is_user: false,
    }
    : { ...msg.from!, is_user: msg.from?.is_bot ? false : true };
}

// Option builders
export const HTML = { parse_mode: "HTML" as const };

// Predicates
export async function admins(ctx: Context) {
  const author = await ctx.getAuthor();
  if (author.status === "administrator" || author.status === "creator") {
    return true;
  }
  return false;
}

export async function nonAdmins(ctx: Context) {
  return !(await admins(ctx));
}

export function containsAdminMention(
  ctx: Filter<
    ChatTypeContext<Context, "group" | "supergroup">,
    "msg:entities:mention" | "msg:caption_entities:mention"
  >,
) {
  const text = (ctx.msg.text ?? ctx.msg.caption)!;
  return (ctx.msg.entities ?? ctx.msg.caption_entities)
    .find((e) => {
      const t = text.slice(e.offset, e.offset + e.length);
      return e.type === "mention" && (t === "@admin" || t === "@admins");
    }) !== undefined;
}
