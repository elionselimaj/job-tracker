import { classifyEmail } from "@/lib/classify";
import { db } from "@/lib/db";
import { fetchMessage, listMessageIds } from "@/lib/gmail";
import { isSameOrigin } from "@/lib/same-origin";
import { runSync } from "@/lib/sync";
import { beginSync, endSync } from "@/lib/sync-control";
import { describeError } from "@/lib/sync-errors";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });

  const account = await db.gmailAccount.findUnique({ where: { id: 1 } });
  if (!account) return new Response("Gmail is not connected", { status: 400 });
  const run = beginSync();
  if (!run) return new Response("A sync is already running", { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: object) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      // A closed tab has no Stop button left, so it stops the sync too. Finished
      // work is kept and the next sync resumes.
      request.signal.addEventListener("abort", () => {
        open = false;
        run.abort();
      });

      try {
        const summary = await runSync(
          {
            listMessageIds: (since) => listMessageIds(account.refreshToken, since),
            fetchMessage: (id) => fetchMessage(account.refreshToken, id),
            classify: classifyEmail,
          },
          account.lastSyncAt,
          (done, total) => send({ type: "progress", done, total }),
          run.signal,
        );
        send({ type: "done", summary });
      } catch (error) {
        console.error("Sync failed:", error);
        send({ type: "error", message: describeError(error) });
      } finally {
        endSync();
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
