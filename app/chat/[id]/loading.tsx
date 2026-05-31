import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly on navigation to a chat while the server fetches the conversation.
export default function ChatLoading() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="pb-4 pl-14 pr-3 pt-5">
        <Skeleton className="h-6 w-56" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-6 pt-2">
          <div className="flex justify-end">
            <Skeleton className="h-9 w-2/5 rounded-3xl" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-2">
          <Skeleton className="h-12 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
