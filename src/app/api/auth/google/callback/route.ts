import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchEmailAddress, GMAIL_SCOPE, oauthClient } from "@/lib/gmail";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (reason: string) => NextResponse.redirect(`${url.origin}/?gmail=${reason}`);

  const jar = await cookies();
  const expectedState = jar.get("oauth_state")?.value;
  jar.delete({ name: "oauth_state", path: "/api/auth/google" });

  const code = url.searchParams.get("code");
  if (!code || !expectedState || url.searchParams.get("state") !== expectedState) {
    return fail("denied");
  }

  try {
    const { tokens } = await oauthClient(url.origin).getToken(code);
    if (!tokens.refresh_token) return fail("no_refresh_token");
    if (!tokens.scope?.split(" ").includes(GMAIL_SCOPE)) return fail("scope_missing");

    const email = await fetchEmailAddress(tokens.refresh_token);
    const existing = await db.gmailAccount.findUnique({ where: { id: 1 } });
    const lastSyncAt = existing?.email === email ? existing.lastSyncAt : null;

    await db.gmailAccount.upsert({
      where: { id: 1 },
      create: { email, refreshToken: tokens.refresh_token },
      update: { email, refreshToken: tokens.refresh_token, lastSyncAt },
    });
  } catch (error) {
    console.error("Gmail connection failed:", error instanceof Error ? error.message : error);
    return fail("failed");
  }

  return NextResponse.redirect(url.origin);
}
