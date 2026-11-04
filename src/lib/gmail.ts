import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { convert } from "html-to-text";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface EmailMessage {
  messageId: string;
  threadId: string;
  subject: string;
  sender: string;
  recipient: string;
  /** The user wrote this email, rather than received it. */
  sent: boolean;
  receivedAt: Date;
  body: string;
}

export function oauthClient(origin: string) {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${origin}/api/auth/google/callback`,
  });
}

function gmailApi(refreshToken: string) {
  const auth = oauthClient("http://localhost");
  auth.setCredentials({ refresh_token: refreshToken });
  return gmail({ version: "v1", auth });
}

export async function fetchEmailAddress(refreshToken: string) {
  const { data } = await gmailApi(refreshToken).users.getProfile({ userId: "me" });
  return data.emailAddress ?? "";
}

/** Message ids received after `since`, oldest first. */
export async function listMessageIds(refreshToken: string, since: Date) {
  const api = gmailApi(refreshToken);
  const q = `after:${Math.floor(since.getTime() / 1000)} -in:drafts -in:chats`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await api.users.messages.list({
      userId: "me",
      q,
      maxResults: 500,
      pageToken,
    });
    ids.push(...(data.messages ?? []).flatMap((message) => message.id ?? []));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids.reverse();
}

export async function fetchMessage(refreshToken: string, id: string): Promise<EmailMessage> {
  const { data } = await gmailApi(refreshToken).users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  return toEmailMessage(data);
}

export function toEmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? "";
  return {
    messageId: message.id!,
    threadId: message.threadId!,
    subject: header("subject"),
    sender: header("from"),
    recipient: header("to"),
    sent: message.labelIds?.includes("SENT") ?? false,
    receivedAt: new Date(Number(message.internalDate)),
    body: extractBody(message.payload) || message.snippet || "",
  };
}

function extractBody(payload?: gmail_v1.Schema$MessagePart) {
  const parts = flatten(payload);
  const decode = (part?: gmail_v1.Schema$MessagePart) =>
    part?.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";

  const plain = decode(parts.find((part) => part.mimeType === "text/plain")).trim();
  if (plain) return plain;

  const html = decode(parts.find((part) => part.mimeType === "text/html"));
  return html
    ? convert(html, {
        wordwrap: false,
        selectors: [
          { selector: "img", format: "skip" },
          { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        ],
      }).trim()
    : "";
}

function flatten(part?: gmail_v1.Schema$MessagePart): gmail_v1.Schema$MessagePart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

export function threadUrl(threadId: string, accountEmail?: string | null) {
  return `https://mail.google.com/mail/u/${accountEmail || 0}/#all/${threadId}`;
}
