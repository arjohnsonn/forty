"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, User } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  fetchBrowseCourses,
  searchProfessors,
  type BrowseCourse,
  type ProfessorListItem,
} from "@/lib/browse";
import { formatName } from "@/lib/courses";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Item = {
  key: string;
  kind: "course" | "professor";
  insert: string; // text written into the field
  primary: string;
  secondary?: string;
};

const toTitle = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Keep the topic (not just the code): shared numbers like UGS 303 have several distinct topics,
// so inserting "UGS 303 Sleep…" lets the scheduler resolve the exact course.
const courseToItem = (c: BrowseCourse): Item => {
  const base = c.courseCode ?? c.courseHeader;
  const topic = c.courseCode
    ? c.courseHeader.slice(c.courseCode.length).trim()
    : "";
  return {
    key: `c${c.courseId}`,
    kind: "course",
    insert: (topic ? `${base} ${toTitle(topic)}` : base).replace(/,/g, ""),
    primary: c.courseCode ?? c.courseHeader,
    secondary: c.courseCode ? c.courseHeader : undefined,
  };
};

const profToItem = (p: ProfessorListItem): Item => {
  const name = formatName(p.name);
  return {
    key: `p${p.id}`,
    kind: "professor",
    insert: name, // formatName drops the "LAST, FIRST" comma so it's safe in a list
    primary: name,
    secondary: p.rmpDepartment ?? undefined,
  };
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  id?: string;
  // When true, treat the value as a comma-separated list and only autocomplete the segment
  // after the last comma (so users can pick several entries in one field).
  multiple?: boolean;
  autoFocus?: boolean;
  // Also search professors, not just courses.
  includeProfessors?: boolean;
};

export function CourseSearchInput({
  value,
  onChange,
  onEnter,
  placeholder,
  id,
  multiple,
  autoFocus,
  includeProfessors,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [results, setResults] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // After a pick the value equals the query; skip one search so the dropdown doesn't reopen.
  const skipNextSearch = useRef(false);

  const segment = (multiple ? (value.split(",").pop() ?? "") : value).trim();

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      setOpen(false);
      return;
    }
    if (segment.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [courses, profs] = await Promise.all([
          fetchBrowseCourses(
            supabase,
            { search: segment },
            0,
            includeProfessors ? 5 : 8,
          ),
          includeProfessors
            ? searchProfessors(supabase, segment, 0, 5)
            : Promise.resolve({ items: [] as ProfessorListItem[], total: 0 }),
        ]);
        if (cancelled) return;
        const items = [
          ...courses.items.map(courseToItem),
          ...profs.items.map(profToItem),
        ];
        setResults(items);
        setHighlight(0);
        setOpen(items.length > 0);
      } catch {
        if (!cancelled) {
          setResults([]);
          setOpen(false);
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [segment, supabase, includeProfessors]);

  const select = (item: Item) => {
    skipNextSearch.current = true;
    if (multiple) {
      const committed = value
        .split(",")
        .slice(0, -1)
        .map((p) => p.trim())
        .filter(Boolean);
      onChange([...committed, item.insert].join(", ") + ", ");
    } else {
      onChange(item.insert);
    }
    setOpen(false);
    setResults([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (open && results.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              select(results[highlight]);
            } else if (e.key === "Escape") {
              // Close the dropdown without also closing the surrounding dialog.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {results.map((item, i) => {
            const Icon = item.kind === "professor" ? User : BookOpen;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(item);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    i === highlight && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.primary}</span>
                    {item.secondary && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.secondary}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
