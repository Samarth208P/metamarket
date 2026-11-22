import type { Market } from "@shared/api";
import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  Loader2,
  Shield,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { MarketComposer } from "@/components/admin/MarketComposer";
import { MarketDirectory } from "@/components/admin/MarketDirectory";
import { adminRequest, formatRupees } from "@/components/admin/markets";
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
import { cn } from "@/lib/utils";
import { fetchMarkets, marketCatalogKey } from "@/lib/markets";

interface SolvencyOverview {
  realReserves: number;
  totalPotentialPayouts: number;
  solvencyRatio: number | null;
  threshold: number;
  isBelowThreshold: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

const solvencyKey = ["adminSolvency"];
const adminsKey = ["admin-list"];
const toolbarButton = "border-border hover:bg-muted hover:text-foreground";
const settingsDialog =
  "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl";

function SolvencyGuard({
  overview,
}: {
  overview: UseQueryResult<SolvencyOverview, Error>;
}) {
  const [draft, setDraft] = useState<{
    realReserves: string;
    threshold: string;
  }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const data = overview.data;
  const settings = draft ?? {
    realReserves: String(data?.realReserves ?? ""),
    threshold: String(data?.threshold ?? ""),
  };

  const save = useMutation({
    mutationFn: () =>
      adminRequest<SolvencyOverview>(
        "/admin/solvency",
        "Unable to save solvency settings.",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realReserves: Number(settings.realReserves),
            threshold: Number(settings.threshold),
          }),
        },
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(solvencyKey, updated);
      setDraft(undefined);
      toast({ title: "Solvency settings saved" });
    },
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && !save.isPending) {
          setDraft(undefined);
          save.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            toolbarButton,
            data?.isBelowThreshold &&
              "border-red-500/30 text-red-700 dark:text-red-300",
          )}
        >
          <Activity aria-hidden="true" /> Solvency Guard
          {data?.isBelowThreshold && (
            <span
              className="size-2 rounded-full bg-red-600"
              aria-label="Market creation paused"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className={settingsDialog}>
        <DialogHeader className="pr-5">
          <DialogTitle>Solvency Guard</DialogTitle>
          <DialogDescription>
            Track reserves against potential payouts across open markets.
          </DialogDescription>
        </DialogHeader>
        {data ? (
          <>
            <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Real reserves</dt>
                <dd className="mt-1 font-bold tabular-nums">
                  {formatRupees(data.realReserves)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Potential payouts
                </dt>
                <dd className="mt-1 font-bold tabular-nums">
                  {formatRupees(data.totalPotentialPayouts)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Solvency ratio
                </dt>
                <dd className="mt-1 font-bold tabular-nums">
                  {data.solvencyRatio?.toFixed(2) ?? "∞"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Guard status</dt>
                <dd
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    data.isBelowThreshold
                      ? "text-red-700 dark:text-red-300"
                      : "text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {data.isBelowThreshold ? "Creation paused" : "Healthy"}
                </dd>
              </div>
            </dl>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!save.isPending) save.mutate();
              }}
            >
              <fieldset
                disabled={save.isPending}
                className="grid min-w-0 gap-4 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label htmlFor="solvency-reserves">Real reserves (₹)</Label>
                  <Input
                    id="solvency-reserves"
                    type="number"
                    min={0}
                    step="any"
                    value={settings.realReserves}
                    onChange={(event) =>
                      setDraft({
                        ...settings,
                        realReserves: event.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="solvency-threshold">
                    Minimum reserve ratio
                  </Label>
                  <Input
                    id="solvency-threshold"
                    type="number"
                    min={0.000001}
                    step="any"
                    value={settings.threshold}
                    onChange={(event) =>
                      setDraft({ ...settings, threshold: event.target.value })
                    }
                    required
                  />
                </div>
              </fieldset>
              {save.error && (
                <p
                  role="alert"
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  {save.error.message}
                </p>
              )}
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save solvency settings"}
              </Button>
            </form>
          </>
        ) : overview.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {overview.error.message}
            </p>
            <Button variant="outline" onClick={() => overview.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading solvency metrics…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
            Manage access to markets, solvency settings, and administrator
            permissions.
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
  const solvency = useQuery({
    queryKey: solvencyKey,
    queryFn: () =>
      adminRequest<SolvencyOverview>(
        "/admin/solvency",
        "Unable to load solvency metrics.",
      ),
  });

  function syncMarket(market: Market) {
    queryClient.setQueryData<Market[]>(marketCatalogKey, (current = []) => {
      if (!current.some(({ id }) => id === market.id))
        return [market, ...current];
      return current.map((item) => (item.id === market.id ? market : item));
    });
    queryClient.invalidateQueries({ queryKey: marketCatalogKey });
    queryClient.invalidateQueries({ queryKey: ["market", market.id] });
    queryClient.invalidateQueries({ queryKey: solvencyKey });
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
            <div className="flex flex-wrap gap-2">
              <SolvencyGuard overview={solvency} />
              <AdminManagement />
            </div>
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
              <a href="#create-market">
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
            <MarketComposer
              blocked={solvency.data?.isBelowThreshold === true}
              onCreated={syncMarket}
            />
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
