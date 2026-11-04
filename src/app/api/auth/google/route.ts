import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GMAIL_SCOPE, oauthClient } from "@/lib/gmail";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${origin}/?gmail=missing_config`);
  }

  const state = randomBytes(24).toString("hex");
  (await cookies()).set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });

  return NextResponse.redirect(
    oauthClient(origin).generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // Google only returns a refresh token with this.
      scope: [GMAIL_SCOPE],
      state,
    }),
  );
}
