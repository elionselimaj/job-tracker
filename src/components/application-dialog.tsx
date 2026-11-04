"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteApplication, saveNotes } from "@/app/actions";
import { formatDate, type Card } from "@/components/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { COLUMNS } from "@/lib/status";

interface ApplicationDialogProps {
  application: Card | null;
  onClose: () => void;
}

export function ApplicationDialog({ application, onClose }: ApplicationDialogProps) {
  const [notes, setNotes] = useState(application?.notes ?? "");
  const [pending, startTransition] = useTransition();

  if (!application) return null;
  const { id, company } = application;
  const dirty = notes !== application.notes;

  function handleSave() {
    startTransition(async () => {
      try {
        await saveNotes(id, notes);
        toast.success("Notes saved");
      } catch {
        toast.error("Could not save notes");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteApplication(id);
        onClose();
      } catch {
        toast.error(`Could not delete ${company}`);
      }
    });
  }

  const details = [
    ["Status", COLUMNS.find((column) => column.status === application.status)?.title],
    ["Source", application.source ?? "Unknown"],
    ["Applied", formatDate(application.appliedAt)],
    ["Last email", application.lastEmailAt ? formatDate(application.lastEmailAt) : "None"],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{company}</DialogTitle>
          <DialogDescription>{application.role}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {application.manuallyMoved && application.status !== "REJECTED" && (
          <p className="text-xs text-muted-foreground">
            You moved this card, so sync will not move it. Rejection emails appear under Needs
            review instead.
          </p>
        )}

        {application.threadUrl && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={application.threadUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
            Open email thread
          </Button>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="notes" className="text-xs text-muted-foreground">
            Notes
          </label>
          <Textarea
            id="notes"
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contacts, interview prep, salary…"
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" className="text-muted-foreground">
                  <Trash2 />
                  Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                <AlertDialogDescription>
                  {company} and its notes will be removed. Sync will not bring it back from emails
                  it has already read.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSave} disabled={!dirty || pending}>
            Save notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
