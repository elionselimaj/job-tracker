"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DATE_RANGES } from "@/lib/filters";
import { fieldClass, cn } from "@/lib/utils";

interface FilterBarProps {
  query: string;
  range: string;
  shown: number;
  total: number;
  onQueryChange: (query: string) => void;
  onRangeChange: (range: string) => void;
  onClear: () => void;
}

export function FilterBar({
  query,
  range,
  shown,
  total,
  onQueryChange,
  onRangeChange,
  onClear,
}: FilterBarProps) {
  const filtering = query.trim() !== "" || range !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search company, role, source or notes"
          placeholder="Search company, role, source or notes"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className={cn(fieldClass, "w-full pl-8")}
        />
      </div>
      <select
        aria-label="Applied date"
        value={range}
        onChange={(event) => onRangeChange(event.target.value)}
        className={fieldClass}
      >
        {DATE_RANGES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {filtering && (
        <>
          <span className="text-sm text-muted-foreground">
            Showing {shown} of {total}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear
          </Button>
        </>
      )}
    </div>
  );
}
