"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Star, Users } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  searchProfessors,
  fetchProfessorProfile,
  type ProfessorListItem,
  type ProfessorProfile,
} from "@/lib/browse";
import { formatName } from "@/lib/courses";
import { useToast } from "@/components/hooks/use-toast";
import ProfessorDialog from "@/components/ProfessorDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function ProfessorRow({ p, onOpen }: { p: ProfessorListItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-texas/60 hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{formatName(p.name)}</p>
        {p.rmpDepartment && (
          <p className="truncate text-xs text-muted-foreground">{p.rmpDepartment}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {p.rmpRating != null ? (
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-semibold">{p.rmpRating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/5</span>
            {p.rmpNumRatings != null && (
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {p.rmpNumRatings}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Grades &amp; evals</span>
        )}
      </div>
    </button>
  );
}

export default function ProfessorsView() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProfessorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const [openId, setOpenId] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfessorProfile | null>(null);

  const reqId = useRef(0);
  const openRef = useRef<number | null>(null);

  const load = useCallback(
    async (q: string) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(false);
      try {
        const { items, total } = await searchProfessors(supabase, q, 0);
        if (id !== reqId.current) return;
        setItems(items);
        setTotal(total);
      } catch {
        if (id !== reqId.current) return;
        setError(true);
        setItems([]);
        setTotal(0);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const loadMore = async () => {
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const { items: more } = await searchProfessors(supabase, query, items.length);
      if (id !== reqId.current) return;
      setItems((prev) => [...prev, ...more]);
    } catch {
      // keep what's shown
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  };

  const openProfile = useCallback(
    async (p: ProfessorListItem) => {
      openRef.current = p.id;
      setOpenId(p.id);
      setProfile(null);
      try {
        const data = await fetchProfessorProfile(supabase, p.id);
        if (openRef.current !== p.id) return; // user closed/switched while loading
        if (!data) {
          openRef.current = null;
          setOpenId(null);
          toast({ variant: "destructive", title: "Professor details unavailable" });
          return;
        }
        setProfile(data);
      } catch {
        if (openRef.current !== p.id) return;
        openRef.current = null;
        setOpenId(null);
        toast({ variant: "destructive", title: "Couldn't load professor details" });
      }
    },
    [supabase, toast]
  );

  const closeProfile = () => {
    openRef.current = null;
    setOpenId(null);
    setProfile(null);
  };

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pl-14 pt-5">
        <div className="flex items-center gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-foreground">Professors</h2>
          <Badge variant="outline" className="shrink-0 border-texas/30 bg-texas/10 font-normal text-texas">
            Fall 2026
          </Badge>
          <Badge variant="secondary" className="shrink-0 font-normal">
            {total.toLocaleString()} {total === 1 ? "professor" : "professors"}
          </Badge>
        </div>
        <div className="relative mt-3">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search professors by name"
            className="pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-5">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[3.75rem] w-full rounded-lg" />
            ))
          ) : error ? (
            <EmptyState
              icon={<Users className="h-8 w-8 text-muted-foreground" />}
              title="Couldn't load professors"
              body="Something went wrong with the search. Try again."
              action={
                <Button variant="outline" onClick={() => load(query)}>
                  Retry
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8 text-muted-foreground" />}
              title="No professors found"
              body={query.trim() ? `No professors match "${query.trim()}".` : "No professors are available."}
            />
          ) : (
            <>
              {items.map((p) => (
                <ProfessorRow key={p.id} p={p} onOpen={() => openProfile(p)} />
              ))}
              {items.length < total && (
                <div className="pt-2 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : `Load more (${(total - items.length).toLocaleString()} left)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ProfessorDialog
        profile={profile}
        loading={openId !== null && !profile}
        onClose={closeProfile}
      />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
