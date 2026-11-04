import { describe, expect, it } from "vitest";
import { toEmailMessage } from "./gmail";

const message = (labelIds: string[]) => ({
  id: "m",
  threadId: "t",
  internalDate: "1767225600000",
  labelIds,
  snippet: "hello",
  payload: {
    headers: [
      { name: "From", value: "me@example.com" },
      { name: "To", value: "jobs@acme.com" },
    ],
  },
});

describe("toEmailMessage", () => {
  it("marks mail the user sent and keeps the recipient", () => {
    expect(toEmailMessage(message(["SENT"]))).toMatchObject({
      sent: true,
      recipient: "jobs@acme.com",
    });
  });

  it("treats everything else as received", () => {
    expect(toEmailMessage(message(["INBOX"])).sent).toBe(false);
  });
});
