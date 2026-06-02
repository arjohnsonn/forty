"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/utils/supabase/client";
import { deleteAccountAction } from "@/app/actions";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useToast } from "@/components/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

// Mirrors the chat Worker's FREE_BUDGET_USD - used only to render the usage bar.
const FREE_BUDGET_USD = 0.1;

export function AccountSettingsDialog({
  open,
  onOpenChange,
  userEmail,
  userName,
  userProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  userName: string;
  userProvider: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [supabase] = useState(() => createClient());
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(userName);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [proUntil, setProUntil] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setName(userName);
    setConfirmOpen(false);
    setConfirmText("");
    supabase
      .from("user_plan")
      .select("pro_until")
      .maybeSingle()
      .then(({ data }) =>
        setProUntil((data?.pro_until as string | null) ?? null),
      );
    supabase
      .from("user_usage")
      .select("spent_usd")
      .eq("period", new Date().toISOString().slice(0, 7)) // 'YYYY-MM' (UTC)
      .maybeSingle()
      .then(({ data }) => setSpent(Number(data?.spent_usd ?? 0)));
  }, [open, userName, supabase]);

  const displayName = userName?.trim() || userEmail;
  const initials = (displayName || "?").charAt(0).toUpperCase();
  const provider = userProvider
    ? userProvider.charAt(0).toUpperCase() + userProvider.slice(1)
    : "Google";

  const trimmedName = name.trim();
  const canSave = !!trimmedName && trimmedName !== userName.trim() && !saving;

  const isPro = !!proUntil && proUntil >= new Date().toISOString().slice(0, 10);
  const usedPct = Math.min(spent / FREE_BUDGET_USD, 1) * 100;

  const handleSaveName = async () => {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: trimmedName },
    });
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Couldn't update name" });
      return;
    }
    toast({ title: "Name updated" });
    router.refresh();
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteAccountAction();
    if (res?.error) {
      setDeleting(false);
      toast({ variant: "destructive", title: res.error });
    }
    // On success the action redirects to "/" and signs out - nothing more to do.
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Account settings</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {userEmail}
              </p>
              <p className="text-xs text-muted-foreground">
                Signed in with {provider}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Plan</Label>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  isPro
                    ? "bg-texas/15 text-texas"
                    : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {isPro ? "Pro" : "Free"}
              </span>
            </div>

            {isPro ? (
              <p className="text-sm text-muted-foreground">
                Active until{" "}
                <span className="font-medium text-foreground">
                  {new Date(proUntil + "T00:00:00").toLocaleDateString(
                    undefined,
                    { month: "long", day: "numeric", year: "numeric" },
                  )}
                </span>
                . Thanks for supporting Forty!
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-texas transition-all"
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(usedPct)}% of your free monthly AI used. Resets
                    monthly!
                  </p>
                </div>

                <Button
                  onClick={() => setUpgradeOpen(true)}
                  className="w-full bg-texas text-white hover:bg-texas/90"
                >
                  Upgrade to Pro
                </Button>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) {
                    e.preventDefault();
                    handleSaveName();
                  }
                }}
                placeholder="Your name"
              />
              <Button onClick={handleSaveName} disabled={!canSave}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Appearance</Label>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(({ value, label, icon: Icon }) => {
                const active = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border py-3 text-sm transition-colors",
                      active
                        ? "border-texas bg-texas/10 text-texas"
                        : "border-input text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-foreground/10 pt-4">
            <Label className="text-lg text-destructive">Danger Zone</Label>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all of your chats and
              schedules. This can&apos;t be undone.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmText("");
                setConfirmOpen(true);
              }}
            >
              Delete account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !deleting && setConfirmOpen(o)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and all of your chats and
              schedules. Type <span className="font-medium">{userEmail}</span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={userEmail}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleting ||
                confirmText.trim().toLowerCase() !== userEmail.toLowerCase()
              }
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}
