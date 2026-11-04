"use client";

import { RefreshCw, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { previewSync, stopSync } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SyncSummary } from "@/lib/sync";
import { cn } from "@/lib/utils";

type SyncEvent =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; summary: SyncSummary }
  | { type: "error"; message: string };

interface Preview {
  count: number;
  model: string;
  cost: string | null;
}

function describe({ scanned, created, rejected, needsReview, stopped }: SyncSummary) {
  if (scanned === 0) return stopped ? "Sync stopped" : "No new emails";
  const parts = [`${scanned} ${scanned === 1 ? "email" : "emails"} read`];
  if (created) parts.push(`${created} added`);
  if (rejected) parts.push(`${rejected} moved to Rejected`);
  if (needsReview) parts.push(`${needsReview} need review`);
  if (stopped) parts.unshift("Sync stopped");
  return parts.join(", ");
}

export function SyncButton({ lastSyncAt }: { lastSyncAt: Date | null }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function handleEvent(event: SyncEvent) {
    if (event.type === "progress") setProgress(event);
    if (event.type === "done") toast.success(describe(event.summary));
    if (event.type === "error") toast.error(event.message);
  }

  async function check() {
    setChecking(true);
    try {
      const result = await previewSync();
      if ("error" in result) toast.error(result.error);
      else if (result.count === 0) toast.success("No new emails");
      else setPreview(result);
    } catch {
      toast.error("Could not check for new emails");
    } finally {
      setChecking(false);
    }
  }

  async function stop() {
    setStopping(true);
    await stopSync();
  }

  async function sync() {
    setPreview(null);
    setSyncing(true);
    setProgress(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok || !response.body) throw new Error(await response.text());

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach((line) => handleEvent(JSON.parse(line)));
      }
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
      setStopping(false);
      setProgress(null);
      router.refresh();
    }
  }

  return (
    <>
      <span suppressHydrationWarning className="text-sm text-muted-foreground">
        {lastSyncAt
          ? `Synced ${lastSyncAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : "Never synced"}
      </span>
      {syncing && (
        <Button variant="outline" size="sm" onClick={stop} disabled={stopping}>
          <Square />
          {stopping ? "Stopping…" : "Stop"}
        </Button>
      )}
      <Button size="sm" onClick={check} disabled={syncing || checking}>
        <RefreshCw className={cn((syncing || checking) && "animate-spin")} />
        {checking
          ? "Checking…"
          : !syncing
            ? "Sync"
            : progress?.total
              ? `Syncing ${progress.done}/${progress.total}`
              : "Syncing…"}
      </Button>
      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Sync {preview?.count} new {preview?.count === 1 ? "email" : "emails"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each email is sent to {preview?.model} to be sorted.{" "}
              {preview?.cost
                ? `Estimated cost: ${preview.cost}.`
                : "The cost of this model is not known to the app."}{" "}
              You can stop at any time and pay only for what was read.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sync}>Start sync</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
