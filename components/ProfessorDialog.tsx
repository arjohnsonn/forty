"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, ChevronRight } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/components/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import { GradeBar, CourseDialog } from "@/components/CourseChips";
import ProfessorRmpPanel, { type RmpPanelProf } from "@/components/ProfessorRmpPanel";
import { formatName, courseCode, titleCase, type RetrievedSection } from "@/lib/courses";
import { fetchCourseDetail, type ProfessorCourse, type ProfessorProfile } from "@/lib/browse";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}

function RmpSummary({ profile, onOpen }: { profile: ProfessorProfile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">RateMyProfessors</span>
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
          Ratings &amp; reviews
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {profile.rmpRating != null && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold text-foreground">{profile.rmpRating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </span>
        )}
        {profile.rmpDifficulty != null && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{profile.rmpDifficulty.toFixed(1)}</span> difficulty
          </span>
        )}
        {profile.rmpWouldTakeAgain != null && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{Math.round(profile.rmpWouldTakeAgain)}%</span> would
            take again
          </span>
        )}
        {profile.rmpNumRatings != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {profile.rmpNumRatings} ratings
          </span>
        )}
      </div>
    </button>
  );
}

function CourseCard({ c, onOpen }: { c: ProfessorCourse; onOpen: () => void }) {
  const code = courseCode(c.courseHeader);
  const title = titleCase(c.courseHeader.slice(code.length).trim());
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full space-y-2 rounded-lg border p-3 text-left transition-colors hover:border-texas/60 hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <span className="font-medium">{code}</span>
          {title && <span className="text-muted-foreground"> {title}</span>}
        </p>
        {(c.courseRating || c.instructorRating) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {!!c.courseRating && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                CES {Number(c.courseRating).toFixed(2)}/5
              </span>
            )}
            {!!c.instructorRating && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                Prof {Number(c.instructorRating).toFixed(2)}/5
              </span>
            )}
          </div>
        )}
      </div>
      {c.grades ? (
        <GradeBar grades={c.grades} />
      ) : (
        <span className="text-xs text-muted-foreground">No grade data</span>
      )}
    </button>
  );
}

function ProfileBody({
  profile,
  onOpenRmp,
  onOpenCourse,
}: {
  profile: ProfessorProfile;
  onOpenRmp: () => void;
  onOpenCourse: (courseId: number) => void;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-5">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="pr-6 text-xl leading-tight">{formatName(profile.name)}</DialogTitle>
          {profile.rmpDepartment && (
            <p className="text-sm text-muted-foreground">{profile.rmpDepartment}</p>
          )}
        </DialogHeader>

        {profile.rmpLegacyId ? (
          <RmpSummary profile={profile} onOpen={onOpenRmp} />
        ) : (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            No RateMyProfessors profile matched — showing grade and evaluation data from past terms.
          </p>
        )}

        {profile.courses.length > 0 ? (
          <section className="space-y-2">
            <SectionLabel>Teaches this semester ({profile.courses.length})</SectionLabel>
            <div className="space-y-2">
              {profile.courses.map((c) => (
                <CourseCard key={c.courseId} c={c} onOpen={() => onOpenCourse(c.courseId)} />
              ))}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Fall 2026 courses on record for this instructor.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <DialogTitle className="sr-only">Loading professor</DialogTitle>
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

// Professor detail: our grade/CES data (left), with the live RateMyProfessors panel sliding out beside
// it (desktop) when the professor is RMP-matched. Mirrors CourseDialog.
export default function ProfessorDialog({
  profile,
  loading,
  onClose,
}: {
  profile: ProfessorProfile | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();
  const [rmpOpen, setRmpOpen] = useState(false);

  // A course opened from the "Teaches this semester" list — its detail dialog stacks over this one.
  const [courseOpenId, setCourseOpenId] = useState<number | null>(null);
  const [courseDetail, setCourseDetail] = useState<RetrievedSection | null>(null);
  const courseRef = useRef<number | null>(null);

  // Auto-open the RMP panel for matched professors, and clear any open course, when the profile changes.
  useEffect(() => {
    setRmpOpen(!!profile?.rmpLegacyId);
    courseRef.current = null;
    setCourseOpenId(null);
    setCourseDetail(null);
  }, [profile?.instructorId, profile?.rmpLegacyId]);

  const openCourse = async (courseId: number) => {
    courseRef.current = courseId;
    setCourseOpenId(courseId);
    setCourseDetail(null);
    try {
      const d = await fetchCourseDetail(supabase, courseId);
      if (courseRef.current !== courseId) return; // closed/switched while loading
      if (!d) {
        courseRef.current = null;
        setCourseOpenId(null);
        toast({ variant: "destructive", title: "Course details unavailable" });
        return;
      }
      setCourseDetail(d);
    } catch {
      if (courseRef.current !== courseId) return;
      courseRef.current = null;
      setCourseOpenId(null);
      toast({ variant: "destructive", title: "Couldn't load course details" });
    }
  };

  const closeCourse = () => {
    courseRef.current = null;
    setCourseOpenId(null);
    setCourseDetail(null);
  };

  const rmpProf: RmpPanelProf | null =
    profile?.rmpLegacyId != null
      ? { legacyId: profile.rmpLegacyId, name: formatName(profile.name), department: profile.rmpDepartment }
      : null;

  return (
    <>
    <Dialog
      open={!!profile || loading}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setRmpOpen(false);
          closeCourse();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="relative flex items-start gap-3 outline-none ring-0 duration-200 focus:outline-none focus-visible:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <div className="relative w-[32rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background shadow-lg">
              <div className="max-h-[85vh] overflow-y-auto p-6">
                {profile ? (
                  <ProfileBody
                    profile={profile}
                    onOpenRmp={() => setRmpOpen((v) => !v)}
                    onOpenCourse={openCourse}
                  />
                ) : loading ? (
                  <ProfileSkeleton />
                ) : null}
              </div>
              <DialogPrimitive.Close className="absolute right-4 top-4 z-10 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            <AnimatePresence>
              {rmpOpen && rmpProf && (
                <motion.aside
                  key="rmp-panel"
                  initial={{ opacity: 0, width: 0, x: -12 }}
                  animate={{ opacity: 1, width: 340, x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="hidden overflow-hidden sm:block"
                >
                  <div className="w-[340px] overflow-hidden rounded-lg border bg-background shadow-lg">
                    <ProfessorRmpPanel prof={rmpProf} onClose={() => setRmpOpen(false)} />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    </Dialog>

      {/* Course detail opened from a "Teaches this semester" card — stacks over this dialog. */}
      <CourseDialog
        section={courseDetail}
        loading={courseOpenId !== null && !courseDetail}
        onClose={closeCourse}
      />
    </>
  );
}
