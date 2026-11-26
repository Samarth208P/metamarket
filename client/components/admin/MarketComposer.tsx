import type { Market, MarketType } from "@shared/api";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  GitFork,
  ImagePlus,
  Loader2,
  Plus,
  Swords,
  ToggleLeft,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { adminRequest, formatRupees, marketTypeLabels } from "./markets";

const categories = [
  "Education",
  "Sports",
  "Technology",
  "Politics",
  "Entertainment",
  "IITR",
];
const marketTypes = [
  { value: "binary", icon: ToggleLeft, description: "One question" },
  { value: "versus", icon: Swords, description: "Two sides" },
  { value: "multi", icon: GitFork, description: "One winning team" },
] as const;
const liquidityPresets = [500, 2000, 5000];
const imageTypes = "image/jpeg,image/png,image/webp";
const emptyDraft = {
  logoUrl: "",
  title: "",
  description: "",
  category: "",
  endDate: "",
  marketType: "binary" as MarketType,
  optionA: "",
  optionB: "",
  shortA: "",
  shortB: "",
  initialB: "1000",
  minB: "250",
  isDynamic: false,
};

interface Team {
  id: number;
  name: string;
  file?: File;
}

const initialTeams = (): Team[] => [
  { id: 1, name: "" },
  { id: 2, name: "" },
];

async function uploadImage(file: File) {
  const body = new FormData();
  body.append("image", file);
  const { url } = await adminRequest<{ url: string }>(
    "/upload",
    "Image upload failed.",
    {
      method: "POST",
      body,
    },
  );
  if (typeof url !== "string") throw new Error("Image upload failed.");
  return url;
}

function ImagePicker({
  file,
  label,
  onChange,
  compact = false,
}: {
  file?: File;
  label: string;
  onChange: (file: File | undefined) => void;
  compact?: boolean;
}) {
  const [preview, setPreview] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : "";
    setPreview(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className={cn(
          "shrink-0 border-border hover:bg-muted hover:text-foreground",
          compact || preview ? "size-10 p-0" : "justify-start",
        )}
        onClick={() => input.current?.click()}
        aria-label={`${file ? "Change" : "Upload"} ${label}`}
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className="size-full rounded-[inherit] object-cover"
          />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
        {!compact && !preview && "Upload logo"}
      </Button>
      <input
        ref={input}
        type="file"
        accept={imageTypes}
        hidden
        onChange={(event) => {
          const nextFile = event.currentTarget.files?.[0];
          if (nextFile) onChange(nextFile);
          event.currentTarget.value = "";
        }}
      />
      {!compact && file && (
        <>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${label}`}
            onClick={() => onChange(undefined)}
          >
            <X aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}

export function MarketComposer({
  onCreated,
}: {
  onCreated: (market: Market) => void;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [teams, setTeams] = useState(initialTeams);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const nextTeamId = useRef(3);
  const { toast } = useToast();

  function updateDraft<Key extends keyof typeof emptyDraft>(
    key: Key,
    value: (typeof emptyDraft)[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateTeam(id: number, values: Partial<Team>) {
    setTeams((current) =>
      current.map((team) => (team.id === id ? { ...team, ...values } : team)),
    );
  }

  async function createMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) return;
    setError("");

    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title || !description || !draft.category) {
      setError("Enter a title, description, and category.");
      return;
    }
    if (
      draft.marketType === "versus" &&
      (!draft.optionA.trim() || !draft.optionB.trim())
    ) {
      setError("Enter a name for both sides.");
      return;
    }
    if (
      draft.marketType === "multi" &&
      teams.some((team) => !team.name.trim())
    ) {
      setError("Enter a name for each team.");
      return;
    }
    if (Number(draft.initialB) < 10 || Number(draft.minB) < 1) {
      setAdvancedOpen(true);
      setError(
        "Enter a base liquidity of at least 10 and a minimum liquidity of at least 1.",
      );
      return;
    }

    setIsCreating(true);
    try {
      const uploadedTeams =
        draft.marketType === "multi"
          ? await Promise.all(
              teams.map(async (team) => ({
                name: team.name.trim(),
                imageUrl: team.file ? await uploadImage(team.file) : undefined,
              })),
            )
          : undefined;
      const market = await adminRequest<Market>(
        "/markets",
        "Unable to create market.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            category: draft.category,
            endDate: draft.endDate
              ? new Date(draft.endDate).toISOString()
              : undefined,
            marketType: draft.marketType,
            initialB: Number(draft.initialB),
            minB: Number(draft.minB),
            isDynamic: draft.isDynamic,
            logoUrl: draft.logoUrl.trim() || undefined,
            teams: uploadedTeams,
            ...(draft.marketType === "versus" && {
              optionA: draft.optionA.trim(),
              optionB: draft.optionB.trim(),
              shortA: draft.shortA.trim(),
              shortB: draft.shortB.trim(),
            }),
          }),
        },
      );

      onCreated(market);
      setDraft(emptyDraft);
      setTeams(initialTeams());
      setAdvancedOpen(false);
      toast({
        title: "Market created",
        description: market.title,
        notificationKind: "market",
        notificationHref: `/market/${market.id}`,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to create market.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section
      id="create-market"
      aria-labelledby="create-market-title"
      className="min-w-0 scroll-mt-20 rounded-2xl border bg-card shadow-sm"
    >
      <header className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Plus className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="create-market-title"
            className="text-lg font-bold tracking-tight"
          >
            Create market
          </h2>
          <p className="text-sm text-muted-foreground">
            Set the format, rules, and closing time.
          </p>
        </div>
      </header>

      <form onSubmit={createMarket} aria-busy={isCreating}>
        <fieldset
          disabled={isCreating}
          className="min-w-0 space-y-4 px-4 py-4 sm:px-6"
        >
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">
              Market format
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {marketTypes.map(({ value, icon: Icon, description }) => (
                <label key={value} className="group relative min-w-0">
                  <input
                    type="radio"
                    name="market-format"
                    value={value}
                    checked={draft.marketType === value}
                    onChange={() => updateDraft("marketType", value)}
                    className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
                  />
                  <span className="flex h-full flex-col items-start gap-1 rounded-lg border bg-background px-2 py-2.5 group-hover:border-primary/50 peer-checked:border-primary peer-checked:bg-primary/[0.07] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 sm:px-3">
                    <Icon
                      className="mb-1 size-4 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold sm:text-sm">
                      {marketTypeLabels[value]}
                    </span>
                    <span className="text-xs leading-tight text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="market-title">Title</Label>
            <Input
              id="market-title"
              placeholder={
                draft.marketType === "binary"
                  ? "Will the event happen?"
                  : "Who will win the event?"
              }
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="market-description">Description</Label>
            <Textarea
              id="market-description"
              placeholder="Describe the event and what determines the outcome."
              value={draft.description}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
              rows={2}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-2">
              <Label htmlFor="market-category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(value) => updateDraft("category", value)}
                required
                disabled={isCreating}
              >
                <SelectTrigger id="market-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="market-close">Closes at (optional)</Label>
              <Input
                id="market-close"
                type="datetime-local"
                value={draft.endDate}
                onChange={(event) => updateDraft("endDate", event.target.value)}
                aria-describedby="market-close-hint"
              />
              <p
                id="market-close-hint"
                className="text-xs text-muted-foreground"
              >
                Your local time. Leave blank to keep trading open until
                resolution.
              </p>
            </div>
          </div>

          {draft.marketType === "versus" && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              {(["A", "B"] as const).map((side) => (
                <div
                  key={side}
                  className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
                >
                  <div className="space-y-2">
                    <Label htmlFor={`market-side-${side}`}>
                      Side {side} name
                    </Label>
                    <Input
                      id={`market-side-${side}`}
                      value={draft[`option${side}`]}
                      onChange={(event) =>
                        updateDraft(`option${side}`, event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`market-short-${side}`}>
                      Short label{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id={`market-short-${side}`}
                      value={draft[`short${side}`]}
                      onChange={(event) =>
                        updateDraft(`short${side}`, event.target.value)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {draft.marketType === "multi" && (
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-semibold">Teams</legend>
              {teams.map((team, index) => (
                <div key={team.id} className="flex items-center gap-2">
                  <ImagePicker
                    compact
                    file={team.file}
                    label={`team ${index + 1} logo`}
                    onChange={(file) => updateTeam(team.id, { file })}
                  />
                  <Input
                    aria-label={`Team ${index + 1} name`}
                    placeholder={`Team ${index + 1} name`}
                    value={team.name}
                    onChange={(event) =>
                      updateTeam(team.id, { name: event.target.value })
                    }
                    required
                  />
                  {teams.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Remove team ${index + 1}`}
                      onClick={() =>
                        setTeams((current) =>
                          current.filter(({ id }) => id !== team.id),
                        )
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hover:bg-muted hover:text-foreground"
                onClick={() => {
                  const id = nextTeamId.current++;
                  setTeams((current) => [...current, { id, name: "" }]);
                }}
              >
                <Plus aria-hidden="true" /> Add team
              </Button>
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="market-image-url">
              Image link{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="market-image-url"
              type="url"
              pattern="https?://.+"
              placeholder="https://example.com/image.jpg"
              value={draft.logoUrl}
              onChange={(event) => updateDraft("logoUrl", event.target.value)}
            />
          </div>

          <div className="rounded-lg border bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-3 py-3 text-left hover:bg-muted/50 hover:text-foreground"
              aria-expanded={advancedOpen}
              aria-controls="market-liquidity"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <span className="font-semibold">Liquidity settings</span>
              <span className="flex items-center gap-2 text-xs font-medium tabular-nums text-muted-foreground">
                {formatRupees(Number(draft.initialB))}
                <ChevronDown
                  className={cn(advancedOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </span>
            </Button>
            <div
              id="market-liquidity"
              hidden={!advancedOpen}
              className="space-y-4 border-t px-3 py-4"
            >
              <div className="space-y-2">
                <Label htmlFor="market-base-b">Base liquidity (B)</Label>
                <p className="text-xs text-muted-foreground">
                  Higher liquidity makes prices harder to move.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    aria-label="Adjust base liquidity"
                    type="range"
                    min={100}
                    max={10000}
                    step={100}
                    value={draft.initialB}
                    onChange={(event) =>
                      updateDraft("initialB", event.target.value)
                    }
                    className="min-w-0 flex-1 accent-primary"
                  />
                  <Input
                    id="market-base-b"
                    className="w-24"
                    type="number"
                    min={10}
                    step={1}
                    value={draft.initialB}
                    onChange={(event) =>
                      updateDraft("initialB", event.target.value)
                    }
                    disabled={!advancedOpen}
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {liquidityPresets.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="aria-pressed:border-primary aria-pressed:bg-primary/10 hover:bg-muted hover:text-foreground"
                      aria-pressed={Number(draft.initialB) === preset}
                      onClick={() => updateDraft("initialB", String(preset))}
                    >
                      {formatRupees(preset)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="market-min-b">
                  Minimum dynamic liquidity (B)
                </Label>
                <Input
                  id="market-min-b"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.minB}
                  onChange={(event) => updateDraft("minB", event.target.value)}
                  disabled={!advancedOpen}
                  required
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isDynamic}
                  onChange={(event) =>
                    updateDraft("isDynamic", event.target.checked)
                  }
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-medium">Dynamic liquidity</span>
                  <span className="text-xs text-muted-foreground">
                    Reduce liquidity toward the minimum as the market closes.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </fieldset>

        <footer className="space-y-3 border-t px-4 py-4 sm:px-6">
          {error && (
            <p
              role="alert"
              className="text-sm font-medium text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full bg-blue-700 text-white hover:bg-blue-800"
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />{" "}
                Creating market…
              </>
            ) : (
              <>
                <Plus aria-hidden="true" /> Create market
              </>
            )}
          </Button>
        </footer>
      </form>
    </section>
  );
}
