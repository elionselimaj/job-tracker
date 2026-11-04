"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { dismissReview, resolveReview } from "@/app/actions";
import type { ReviewItem } from "@/components/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Status } from "@/generated/prisma/enums";
import { COLUMNS, REVIEW_OUTCOMES } from "@/lib/status";
import { cn, fieldClass } from "@/lib/utils";

const NEW_CARD = "new";

function ReviewRow({ item }: { item: ReviewItem }) {
  const [cardId, setCardId] = useState(
    item.cardId ?? (item.outcome === "ambiguous" ? "" : NEW_CARD),
  );
  const [company, setCompany] = useState(item.company ?? "");
  const [role, setRole] = useState(item.role ?? "");
  const [status, setStatus] = useState<Status>(
    item.classification === "applied" ? "APPLIED" : "REJECTED",
  );
  const [pending, setPending] = useState(false);

  const creating = cardId === NEW_CARD;
  const ready = cardId !== "" && (!creating || company.trim() !== "");

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } catch {
      toast.error("That did not work. Please try again.");
      setPending(false);
    }
  }

  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="grid gap-1">
        <p className="truncate font-medium">
          {[item.company, item.role].filter(Boolean).join(" · ") || item.sender}
        </p>
        <p className="truncate text-muted-foreground">{item.subject || "(no subject)"}</p>
        <p className="text-xs text-muted-foreground">{REVIEW_OUTCOMES[item.outcome]}</p>
      </div>

      {item.cards.length > 0 && (
        <select
          aria-label="Card"
          value={cardId}
          onChange={(event) => setCardId(event.target.value)}
          className={fieldClass}
        >
          {cardId === "" && <option value="">Choose a card…</option>}
          {item.cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.label}
            </option>
          ))}
          <option value={NEW_CARD}>Create a new card</option>
        </select>
      )}

      {creating && (
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="Company"
            placeholder="Company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className={fieldClass}
          />
          <input
            aria-label="Role"
            placeholder="Role (optional)"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={fieldClass}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as Status)}
          className={cn(fieldClass, "flex-1")}
        >
          {COLUMNS.map((column) => (
            <option key={column.status} value={column.status}>
              {column.title}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!ready || pending}
          onClick={() =>
            run(() =>
              resolveReview(item.messageId, {
                status,
                cardId: creating ? null : cardId,
                company,
                role,
              }),
            )
          }
        >
          Save
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={item.threadUrl} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink />
          Open email
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => dismissReview(item.messageId))}
        >
          Dismiss
        </Button>
      </div>
    </li>
  );
}

export function ReviewDialog({ items }: { items: ReviewItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Needs review ({items.length})
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Needs review</DialogTitle>
          <DialogDescription>
            Emails sync would not act on by itself. Choose a status, or dismiss the ones that do not
            matter.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[60vh] gap-3 overflow-y-auto">
          {items.map((item) => (
            <ReviewRow key={item.messageId} item={item} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
