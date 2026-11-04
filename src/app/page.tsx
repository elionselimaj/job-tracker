import { connection } from "next/server";
import { Suspense } from "react";
import { Tracker } from "@/components/tracker";
import { db } from "@/lib/db";
import { threadUrl } from "@/lib/gmail";
import { sameCompany } from "@/lib/matching";
import { COLUMNS, REVIEW_OUTCOMES } from "@/lib/status";

const GMAIL_ERRORS: Record<string, string> = {
  missing_config: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, then restart the app.",
  denied: "Gmail was not connected. Google sign-in was cancelled or expired.",
  no_refresh_token: "Google did not return a refresh token. Please try connecting again.",
  scope_missing: "Tick the Gmail read permission on Google's consent screen and try again.",
  failed: "Connecting Gmail failed. Check the server log for details.",
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const { gmail } = await searchParams;

  const [applications, account, reviewEmails] = await Promise.all([
    db.application.findMany({ orderBy: { appliedAt: "desc" } }),
    db.gmailAccount.findUnique({ where: { id: 1 } }),
    db.processedEmail.findMany({
      where: { reviewed: false, outcome: { in: Object.keys(REVIEW_OUTCOMES) } },
      include: { application: true },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  const link = (threadId: string) => threadUrl(threadId, account?.email);

  const describeCard = ({ id, role, status }: (typeof applications)[number]) => ({
    id,
    label: `${role} (${COLUMNS.find((column) => column.status === status)?.title})`,
  });
  const candidates = ({ application, company }: (typeof reviewEmails)[number]) => {
    if (application) return applications.filter(({ id }) => id === application.id);
    return company ? applications.filter((card) => sameCompany(card.company, company)) : [];
  };

  return (
    <Tracker
      applications={applications.map((application) => ({
        ...application,
        threadUrl: application.gmailThreadId ? link(application.gmailThreadId) : null,
      }))}
      reviewItems={reviewEmails.map((email) => ({
        messageId: email.messageId,
        subject: email.subject,
        sender: email.sender,
        company: email.application?.company ?? email.company,
        role: email.application?.role ?? email.role,
        outcome: email.outcome as keyof typeof REVIEW_OUTCOMES,
        classification: email.classification,
        cards: candidates(email).map(describeCard),
        cardId: email.applicationId,
        threadUrl: link(email.threadId),
      }))}
      gmail={account ? { email: account.email, lastSyncAt: account.lastSyncAt } : null}
      gmailError={typeof gmail === "string" ? GMAIL_ERRORS[gmail] : undefined}
    />
  );
}
