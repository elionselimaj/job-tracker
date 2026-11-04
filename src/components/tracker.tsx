"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { disconnectGmail } from "@/app/actions";
import { ApplicationDialog } from "@/components/application-dialog";
import { Board } from "@/components/board";
import { FilterBar } from "@/components/filter-bar";
import { ReviewDialog } from "@/components/review-dialog";
import { SyncButton } from "@/components/sync-button";
import type { Card, ReviewItem } from "@/components/types";
import { Button } from "@/components/ui/button";
import { DATE_RANGES, filterCards } from "@/lib/filters";

interface TrackerProps {
  applications: Card[];
  reviewItems: ReviewItem[];
  gmail: { email: string; lastSyncAt: Date | null } | null;
  gmailError?: string;
}

export function Tracker({ applications, reviewItems, gmail, gmailError }: TrackerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = applications.find((application) => application.id === selectedId) ?? null;

  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all");
  const [since, setSince] = useState<number | null>(null);
  const shown = filterCards(applications, query, since);

  function changeRange(value: string) {
    const ms = DATE_RANGES.find((option) => option.value === value)?.ms ?? null;
    setRange(value);
    setSince(ms === null ? null : Date.now() - ms);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Job Tracker</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {gmail ? (
            <>
              <span className="text-sm text-muted-foreground">{gmail.email}</span>
              <Button variant="ghost" size="sm" onClick={() => disconnectGmail()}>
                Disconnect
              </Button>
              {reviewItems.length > 0 && <ReviewDialog items={reviewItems} />}
              <SyncButton lastSyncAt={gmail.lastSyncAt} />
            </>
          ) : (
            <Button nativeButton={false} render={<a href="/api/auth/google" />}>
              <Mail />
              Connect Gmail
            </Button>
          )}
        </div>
      </header>

      {gmailError && (
        <p role="alert" className="border-b bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {gmailError}
        </p>
      )}

      <FilterBar
        query={query}
        range={range}
        shown={shown.length}
        total={applications.length}
        onQueryChange={setQuery}
        onRangeChange={changeRange}
        onClear={() => {
          setQuery("");
          changeRange("all");
        }}
      />

      <Board applications={shown} onOpen={setSelectedId} />

      <ApplicationDialog
        key={selected?.id}
        application={selected}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
