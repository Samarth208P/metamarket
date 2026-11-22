import { useState, type FormEvent } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { USERNAME_PATTERN } from "@shared/api";

export default function Settings() {
  const { user, updateUsername } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const username = draft ?? user?.username ?? "";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = username.trim();
    setError("");
    setSaved(false);
    if (!USERNAME_PATTERN.test(trimmed)) {
      setError("Enter a username with 3–24 letters, numbers, or underscores.");
      return;
    }

    setSaving(true);
    try {
      await updateUsername(trimmed);
      setDraft(null);
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save your username.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <section className="container mx-auto max-w-xl px-4 py-8 md:py-16">
        <h1 className="mb-6 text-3xl font-bold">Account settings</h1>
        <form
          onSubmit={save}
          className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">Google account</p>
            <p className="break-words text-sm text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-username">Username</Label>
            <Input
              id="settings-username"
              autoComplete="username"
              aria-describedby="username-hint"
              aria-invalid={error ? true : undefined}
              value={username}
              maxLength={24}
              disabled={saving}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
                setSaved(false);
              }}
            />
            <p id="username-hint" className="text-sm text-muted-foreground">
              Use 3–24 letters, numbers, or underscores.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm">
              Username saved.
            </p>
          )}
          <Button
            type="submit"
            disabled={saving || username.trim() === user?.username}
          >
            {saving ? "Saving…" : "Save username"}
          </Button>
        </form>
      </section>
    </Layout>
  );
}
