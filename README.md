# Job Tracker

A private Kanban board for your job search that fills itself in from your Gmail.

Applying to lots of jobs means losing track of where you applied, who rejected you and who never replied. Job Tracker reads your email, finds your applications and rejections, and keeps them on one board. It runs entirely on your own computer, and you bring your own Google and Anthropic keys.

## How it helps

- **No data entry.** A confirmation email becomes a card in **Applied**.
- **Rejections file themselves.** A rejection email moves the matching card to **Rejected**.
- **Applications you emailed yourself count too.** Your sent mail is read, so a CV sent straight to a company gets a card.
- **One place for everything.** Drag cards through Applied, In progress, Interview, Offer, Rejected and Close/Hold, and keep notes on each one.
- **Find things quickly.** Search by company, role, source or notes, and filter by when you applied.
- **You stay in charge.** Anything sync is unsure about goes to **Needs review** for you to decide.

## How it works

1. Press **Sync**. The app asks Gmail for new emails, using read-only access, and shows you how many there are and the estimated cost.
2. You confirm. Each email goes to Claude, which sorts it into one of three groups and picks out the company and role.
3. The app updates your board and remembers each email, so none is paid for twice.

| Claude's answer | What happens |
| --- | --- |
| Applied | Creates a card in Applied, unless one already exists for that company and role |
| Rejected | Moves the matching card to Rejected |
| Other | Nothing. Most of your inbox lands here |

Sync never moves a card anywhere except Rejected, and it never moves a card you moved yourself. Emails you sent can create a card but can never reject one.

**Needs review** lists rejections sync would not act on: cards you moved by hand, emails matching no card, emails that could match several cards, and emails Claude could not read. For each one you can pick a card, or create one, and set its status.

The first sync reads the last 30 days (`INITIAL_SYNC_DAYS`). Later syncs read from the previous sync onwards. Drafts and chats are skipped.

## Setup

You need [Node.js](https://nodejs.org/) 22, a Gmail account and about 15 minutes. Most of that is the Google step, which you only do once.

### 1. Install

```bash
git clone https://github.com/elionselimaj/job-tracker.git
cd job-tracker
npm install
cp .env.example .env
npm run setup    # creates the local SQLite database
```

### 2. Create Google keys

These let the app read your Gmail. They are free, and no billing account is needed.

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Under **APIs & Services → Library**, find the **Gmail API** and enable it.
3. Open **Google Auth Platform** and start the setup. Choose **External** as the audience.
4. Under **Data Access**, add the `gmail.readonly` scope.
5. Under **Audience**, add your Gmail address as a **test user**.
6. Under **Clients**, create a client of type **Web application**.
7. Under **Authorized redirect URIs**, not *Authorized JavaScript origins*, add exactly:

   ```
   http://localhost:3000/api/auth/google/callback
   ```

8. Copy the client ID and client secret into `.env`:

   ```
   GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-..."
   ```

While the app is in Testing mode, Google expires the connection after 7 days. Sync will tell you when that happens: press **Disconnect**, then **Connect Gmail**. Your board is kept, and emails already read are not paid for again.

### 3. Create an Anthropic key

This lets Claude sort your emails. It is pay-as-you-go, and it is billed separately from any Claude subscription.

1. Create an account at [platform.claude.com](https://platform.claude.com/).
2. Add a little credit under **Plans & Billing**. See [Costs](#costs) for how much you are likely to use.
3. [Create an API key](https://platform.claude.com/settings/keys) and add it to `.env`:

   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>. Use `localhost`, not `127.0.0.1`, or Google will reject the redirect.

Click **Connect Gmail**, approve access, then click **Sync**. Google will warn that the app is unverified. That is expected for an app you created yourself: choose **Advanced** and continue.

## Costs

Google charges nothing for this. The only cost is Claude, and every email goes to Claude, because the app cannot tell which ones are job-related without reading them. Your bill therefore follows the size of your inbox, not how many jobs you apply to.

| Model | Price per million tokens (input / output) | Per email | 500 emails |
| --- | --- | --- | --- |
| `claude-haiku-5-5` (default) | $0.10 / $0.50 | about 0.02–0.04¢ | **about $0.10–$0.20** |
| `claude-sonnet-5-5` | $2 / $10 | about 0.3–0.7¢ | about $1.70–$3.50 |
| `claude-opus-5-5` | $4 / $20 | about 0.7–1.4¢ | about $3.50–$7 |

These are estimates, assuming 1,500–3,000 input tokens per email, and long emails cost more. For comparison, a real sync of 495 emails on Opus cost about $6. Prices were correct in November 2026; check [current pricing](https://platform.claude.com/docs/en/about-claude/pricing) for changes.

The first sync is the expensive one, because it reads 30 days at once. After that you only pay for new emails.

**Keeping costs under control:**

- **Sync** always shows the email count and estimated cost, and nothing is spent until you confirm.
- **Stop**, **Disconnect** and closing the tab all stop a running sync after the current batch of 5 emails. Finished work is kept and the next sync resumes.
- Lower `INITIAL_SYNC_DAYS` in `.env` to read less on the first sync.
- Set a low credit balance and leave auto-reload off, so spending cannot pass what you added.

To use another model, set `CLAUDE_MODEL` in `.env` and restart. Haiku is the cheapest, and a larger model may sort unusual emails better.

## Privacy and security

- **It runs on your machine.** The server only listens on `127.0.0.1`. There is no login, so do not deploy it to the internet.
- **Gmail access is read-only.** The app cannot send, change or delete email.
- **Your email goes to the Claude API.** That includes emails you sent and everything unrelated to jobs. Read [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) if that matters for your inbox.
- **Email bodies are not stored.** Only the subject, sender and result are kept.
- **Your data is unencrypted on disk.** Your Gmail refresh token and board live in `prisma/dev.db`.
- **Never commit `.env` or `prisma/dev.db`.** Both are gitignored.

## Limitations

- An application with no email trail cannot be found, such as a job site that sends no confirmation. There is no manual "add card" button yet.
- Claude can make mistakes, so check your first few cards. Ordinary emails to recruiters are the most likely false positives.
- Sync only creates cards and moves them to Rejected. Moving a card to Interview or Offer is up to you.
- Raising `INITIAL_SYNC_DAYS` after a first sync reads older emails out of order, so a few older applications may land in Applied even though they were rejected.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `redirect_uri_mismatch` | The redirect URI on your Google client must exactly match the one in step 2, with `http`, `localhost`, `:3000` and no trailing slash |
| `invalid_client` | The client ID or secret in `.env` is wrong. Check for an extra character, or the ID pasted in both places |
| `access_denied` | Add your Gmail address as a test user under **Audience** |
| "Add GOOGLE_CLIENT_ID…" | The keys are missing from `.env`. Save the file, then restart |
| "Credit balance is too low" | Add credit under **Plans & Billing**, then sync again. It resumes where it stopped |
| "Gmail access expired" | Press **Disconnect**, then **Connect Gmail** |

## Development

```bash
npm test         # matching, sync, filter and cost rules
npm run lint
```

Built with Next.js, Prisma and SQLite, the Gmail API and the Claude API.

## License

[MIT](LICENSE)
