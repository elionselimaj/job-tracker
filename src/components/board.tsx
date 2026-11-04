"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { startTransition, useOptimistic, useState } from "react";
import { toast } from "sonner";
import { moveApplication } from "@/app/actions";
import { formatDate, type Card } from "@/components/types";
import { Badge } from "@/components/ui/badge";
import type { Status } from "@/generated/prisma/enums";
import { COLUMNS } from "@/lib/status";
import { cn } from "@/lib/utils";

interface BoardProps {
  applications: Card[];
  onOpen: (id: string) => void;
}

export function Board({ applications, onOpen }: BoardProps) {
  const [cards, moveOptimistically] = useOptimistic(
    applications,
    (current, move: { id: string; status: Status }) =>
      current.map((card) => (card.id === move.id ? { ...card, status: move.status } : card)),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    // The distance keeps a plain click from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Enter is left free to open the card.
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    const card = cards.find((candidate) => candidate.id === active.id);
    const status = over?.id as Status | undefined;
    if (!card || !status || card.status === status) return;

    startTransition(async () => {
      moveOptimistically({ id: card.id, status });
      try {
        await moveApplication(card.id, status);
      } catch {
        toast.error(`Could not move ${card.company}. It has been put back.`);
      }
    });
  }

  const dragging = cards.find((card) => card.id === draggingId);

  return (
    <DndContext
      id="board"
      sensors={sensors}
      onDragStart={({ active }) => setDraggingId(String(active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <main className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            {...column}
            cards={cards.filter((card) => card.status === column.status)}
            onOpen={onOpen}
          />
        ))}
      </main>
      <DragOverlay>{dragging && <CardBody card={dragging} className="shadow-lg" />}</DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  status: Status;
  title: string;
  dot: string;
  cards: Card[];
  onOpen: (id: string) => void;
}

function Column({ status, title, dot, cards, onOpen }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        "flex w-64 min-w-64 flex-1 flex-col rounded-xl bg-muted/50 transition-colors",
        isOver && "bg-muted",
      )}
    >
      <h2 className="flex items-center gap-2 px-3 pt-3 pb-2 text-sm font-medium">
        <span className={cn("size-2 rounded-full", dot)} />
        {title}
        <span className="font-normal text-muted-foreground">{cards.length}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({ card, onOpen }: { card: Card; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${card.company}, ${card.role}`}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(card.id);
        else listeners?.onKeyDown(event);
      }}
      className={cn(
        "cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <CardBody card={card} />
    </div>
  );
}

function CardBody({ card, className }: { card: Card; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3 text-card-foreground", className)}>
      <p className="truncate text-sm font-medium">{card.company}</p>
      <p className="truncate text-sm text-muted-foreground">{card.role}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{formatDate(card.appliedAt)}</span>
        {card.source && (
          <Badge variant="secondary" className="max-w-32 truncate">
            {card.source}
          </Badge>
        )}
      </div>
    </div>
  );
}
