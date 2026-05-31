"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/hooks/use-toast";
import type { Json } from "@/types/database";
import { pickColorIndex, type ScheduleSection, type TimeBlock } from "@/lib/courses";

export type ScheduleRow = {
  id: string;
  name: string;
  sections: ScheduleSection[];
  blocks: TimeBlock[];
  created_at: string;
  updated_at: string;
};

type SchedulesContextValue = {
  schedules: ScheduleRow[];
  loading: boolean;
  createSchedule: (name: string) => Promise<ScheduleRow | null>;
  renameSchedule: (id: string, name: string) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  reorderSchedules: (orderedIds: string[]) => Promise<void>;
  addSection: (scheduleId: string, section: ScheduleSection) => Promise<void>;
  removeSection: (scheduleId: string, sectionId: number) => Promise<void>;
  addBlock: (scheduleId: string, block: TimeBlock) => Promise<void>;
  updateBlock: (scheduleId: string, block: TimeBlock) => Promise<void>;
  removeBlock: (scheduleId: string, blockId: string) => Promise<void>;
};

const noop = async () => {};
const SchedulesContext = createContext<SchedulesContextValue>({
  schedules: [],
  loading: false,
  createSchedule: async () => null,
  renameSchedule: noop,
  deleteSchedule: noop,
  reorderSchedules: noop,
  addSection: noop,
  removeSection: noop,
  addBlock: noop,
  updateBlock: noop,
  removeBlock: noop,
});

export const useSchedules = () => useContext(SchedulesContext);

const SELECT = "id, name, sections, blocks, created_at, updated_at";

function parseRow(row: {
  id: string;
  name: string;
  sections: Json;
  blocks: Json;
  created_at: string;
  updated_at: string;
}): ScheduleRow {
  return {
    id: row.id,
    name: row.name,
    sections: Array.isArray(row.sections) ? (row.sections as unknown as ScheduleSection[]) : [],
    blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as TimeBlock[]) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function SchedulesProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    const { data } = await supabase
      .from("schedules")
      .select(SELECT)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    setSchedules((data ?? []).map(parseRow));
    setLoading(false);
  }, [supabase]);

  // Live updates across tabs/devices (no polling), mirroring the sidebar's conversations channel.
  useEffect(() => {
    fetchSchedules();
    const channel = supabase
      .channel("schedules")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => fetchSchedules()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchSchedules]);

  const createSchedule = useCallback(
    async (name: string) => {
      const { data, error } = await supabase
        .from("schedules")
        .insert({ name, position: schedules.length })
        .select(SELECT)
        .single();
      if (error || !data) {
        toast({ variant: "destructive", title: "Couldn't create schedule" });
        return null;
      }
      const row = parseRow(data);
      setSchedules((prev) => [...prev, row]);
      return row;
    },
    [schedules.length, supabase, toast]
  );

  const reorderSchedules = useCallback(
    async (orderedIds: string[]) => {
      setSchedules((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s] as const));
        const next = orderedIds.map((id) => byId.get(id)).filter((s): s is ScheduleRow => !!s);
        return next.length === prev.length ? next : prev;
      });
      const { error } = await supabase.rpc("set_schedule_positions", { p_ids: orderedIds });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't save order" });
        fetchSchedules();
      }
    },
    [supabase, toast, fetchSchedules]
  );

  const renameSchedule = useCallback(
    async (id: string, name: string) => {
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
      const { error } = await supabase.from("schedules").update({ name }).eq("id", id);
      if (error) {
        toast({ variant: "destructive", title: "Couldn't rename schedule" });
        fetchSchedules();
      }
    },
    [supabase, toast, fetchSchedules]
  );

  const deleteSchedule = useCallback(
    async (id: string) => {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) {
        toast({ variant: "destructive", title: "Couldn't delete schedule" });
        fetchSchedules();
      }
    },
    [supabase, toast, fetchSchedules]
  );

  const addSection = useCallback(
    async (scheduleId: string, section: ScheduleSection) => {
      // Assign a (random, dedup-preferring) color per add so the same course can differ per schedule.
      const existing = schedules.find((s) => s.id === scheduleId)?.sections ?? [];
      const colored: ScheduleSection =
        section.color != null ? section : { ...section, color: pickColorIndex(existing) };
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId && !s.sections.some((x) => x.section_id === colored.section_id)
            ? { ...s, sections: [...s.sections, colored] }
            : s
        )
      );
      const { error } = await supabase.rpc("add_section_to_schedule", {
        p_id: scheduleId,
        p_section: colored as unknown as Json,
      });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't add course" });
        fetchSchedules();
      }
    },
    [schedules, supabase, toast, fetchSchedules]
  );

  const addBlock = useCallback(
    async (scheduleId: string, block: TimeBlock) => {
      const cur = schedules.find((s) => s.id === scheduleId);
      if (!cur) return;
      const next = [...cur.blocks, block];
      setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? { ...s, blocks: next } : s)));
      const { error } = await supabase.rpc("add_block_to_schedule", {
        p_id: scheduleId,
        p_block: block as unknown as Json,
      });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't add time block" });
        fetchSchedules();
      }
    },
    [schedules, supabase, toast, fetchSchedules]
  );

  const updateBlock = useCallback(
    async (scheduleId: string, block: TimeBlock) => {
      const cur = schedules.find((s) => s.id === scheduleId);
      if (!cur) return;
      const next = cur.blocks.map((b) => (b.id === block.id ? block : b));
      setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? { ...s, blocks: next } : s)));
      const { error } = await supabase.rpc("update_block_in_schedule", {
        p_id: scheduleId,
        p_block: block as unknown as Json,
      });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't update time block" });
        fetchSchedules();
      }
    },
    [schedules, supabase, toast, fetchSchedules]
  );

  const removeBlock = useCallback(
    async (scheduleId: string, blockId: string) => {
      const cur = schedules.find((s) => s.id === scheduleId);
      if (!cur) return;
      const next = cur.blocks.filter((b) => b.id !== blockId);
      setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? { ...s, blocks: next } : s)));
      const { error } = await supabase.rpc("remove_block_from_schedule", {
        p_id: scheduleId,
        p_block_id: blockId,
      });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't remove time block" });
        fetchSchedules();
      }
    },
    [schedules, supabase, toast, fetchSchedules]
  );

  const removeSection = useCallback(
    async (scheduleId: string, sectionId: number) => {
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId
            ? { ...s, sections: s.sections.filter((x) => x.section_id !== sectionId) }
            : s
        )
      );
      const { error } = await supabase.rpc("remove_section_from_schedule", {
        p_id: scheduleId,
        p_section_id: sectionId,
      });
      if (error) {
        toast({ variant: "destructive", title: "Couldn't remove course" });
        fetchSchedules();
      }
    },
    [supabase, toast, fetchSchedules]
  );

  return (
    <SchedulesContext.Provider
      value={{
        schedules,
        loading,
        createSchedule,
        renameSchedule,
        deleteSchedule,
        reorderSchedules,
        addSection,
        removeSection,
        addBlock,
        updateBlock,
        removeBlock,
      }}
    >
      {children}
    </SchedulesContext.Provider>
  );
}
