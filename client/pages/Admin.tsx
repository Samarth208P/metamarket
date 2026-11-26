import type { Market } from "@shared/api";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import { Layout } from "@/components/Layout";
import { MarketComposer } from "@/components/admin/MarketComposer";
import { CodexWorkspace } from "@/components/admin/CodexWorkspace";
import { MarketDirectory } from "@/components/admin/MarketDirectory";
import { adminRequest } from "@/components/admin/markets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchMarkets, marketCatalogKey } from "@/lib/markets";

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

const adminsKey = ["admin-list"];
const toolbarButton = "border-border hover:bg-muted hover:text-foreground";
const settingsDialog =
  "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl";

function AdminManagement() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const admins = useQuery({
    queryKey: adminsKey,
    queryFn: () =>
      adminRequest<AdminUser[]>(
        "/admin/list",
        "Unable to load administrators.",
      ),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      adminRequest("/admin/add", "Unable to add administrator.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminsKey });
      setEmail("");
      toast({ title: "Administrator added" });
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      adminRequest("/admin/remove", "Unable to remove administrator.", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminsKey });
      toast({ title: "Administrator removed" });
    },
    onError: (error) =>
      toast({
        title: "Unable to remove administrator",
        description: error.message,
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={toolbarButton}>
          <Shield aria-hidden="true" /> Administrators
        </Button>
      </DialogTrigger>
      <DialogContent className={settingsDialog}>
        <DialogHeader className="pr-5">
          <DialogTitle>Administrators</DialogTitle>
          <DialogDescription>
            Manage administrator access to markets.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim() && !add.isPending) add.mutate();
          }}
        >
          <Label htmlFor="admin-email">User email</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="admin-email"
              type="email"
              className="min-w-32 flex-1"
              placeholder="player@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={add.isPending}
            />
            <Button type="submit" disabled={add.isPending || !email.trim()}>
              <UserPlus aria-hidden="true" />{" "}
              {add.isPending ? "Adding…" : "Add admin"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Users must sign in once before you can add them.
          </p>
          {add.error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {add.error.message}
            </p>
          )}
        </form>
        <section aria-labelledby="current-admins" className="space-y-2">
          <h3 id="current-admins" className="text-sm font-semibold">
            Current administrators
          </h3>
          {admins.isLoading ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />{" "}
              Loading administrators…
            </p>
          ) : admins.isError ? (
            <div className="space-y-2">
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {admins.error.message}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => admins.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : admins.data?.length ? (
            <ul className="divide-y rounded-lg border">
              {admins.data.map((admin) => (
                <li
                  key={admin.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{admin.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {admin.email}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove administrator ${admin.email}`}
                    onClick={() => remove.mutate(admin.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No administrators found.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  const markets = useQuery({
    queryKey: marketCatalogKey,
    queryFn: fetchMarkets,
  });
  function syncMarket(market: Market) {
    queryClient.setQueryData<Market[]>(marketCatalogKey, (current = []) => {
      if (!current.some(({ id }) => id === market.id))
        return [market, ...current];
      return current.map((item) => (item.id === market.id ? market : item));
    });
    queryClient.invalidateQueries({ queryKey: marketCatalogKey });
    queryClient.invalidateQueries({ queryKey: ["market", market.id] });
  }

  return (
    <Layout>
      <div className="flex-1 bg-slate-50 dark:bg-background">
        <div className="mx-auto max-w-[90rem] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-7">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                Market administration
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Create markets, update their settings, and settle outcomes.
              </p>
            </div>
            <AdminManagement />
          </div>

          <nav
            aria-label="Market workspace"
            className="mb-4 flex flex-wrap gap-2 lg:hidden"
          >
            <Button
              size="sm"
              variant="outline"
              className={toolbarButton}
              asChild
            >
              <a href="#market-workspace">
                Create <ArrowDown aria-hidden="true" />
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={toolbarButton}
              asChild
            >
              <a href="#manage-markets">
                Manage <ArrowDown aria-hidden="true" />
              </a>
            </Button>
          </nav>

          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
            <CodexWorkspace>
              <MarketComposer onCreated={syncMarket} />
            </CodexWorkspace>
            <MarketDirectory
              markets={markets.data ?? []}
              isLoading={markets.isLoading}
              hasError={markets.isError}
              onRetry={() => markets.refetch()}
              onUpdated={syncMarket}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
