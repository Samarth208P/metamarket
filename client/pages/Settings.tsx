import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Layout } from "@/components/Layout";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DisclosurePanel } from "@/components/ui/disclosure-panel";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { MAX_IMAGE_BYTES, USERNAME_PATTERN } from "@shared/api";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];

function ProfilePictureSettings() {
  const { user, updateAvatar } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function save(image: File | null) {
    setError("");
    setStatus("");
    setPending(image ? "upload" : "remove");
    try {
      await updateAvatar(image);
      setStatus(image ? "Photo saved." : "Default profile picture restored.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update your photo.",
      );
    } finally {
      setPending(null);
    }
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const image = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!image) return;

    setStatus("");
    if (image.size > MAX_IMAGE_BYTES) {
      setError("Images must be 5 MB or smaller.");
    } else if (image.type && !imageTypes.includes(image.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
    } else {
      void save(image);
    }
  }

  return (
    <section
      aria-labelledby="profile-picture-heading"
      className="mb-4 space-y-3 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 id="profile-picture-heading" className="text-sm font-medium">
        Profile picture
      </h2>
      <div className="flex items-center gap-4">
        <ProfileAvatar
          username={user?.username ?? null}
          avatarUrl={user?.avatarUrl}
          className="h-16 w-16 text-2xl"
        />
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept={imageTypes.join(",")}
            hidden
            onChange={selectImage}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-describedby="profile-picture-hint"
              disabled={pending !== null}
              onClick={() => fileInput.current?.click()}
            >
              {pending === "upload"
                ? "Uploading…"
                : user?.avatarUrl
                  ? "Change photo"
                  : "Upload photo"}
            </Button>
            {user?.avatarUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending !== null}
                onClick={() => void save(null)}
              >
                {pending === "remove" ? "Removing…" : "Remove photo"}
              </Button>
            )}
          </div>
          <p
            id="profile-picture-hint"
            className="text-xs text-muted-foreground"
          >
            JPEG, PNG, or WebP. Up to 5 MB.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}

export default function Settings() {
  const { user, updateUsername } = useAuth();
  const changeUsernameButton = useRef<HTMLButtonElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const username = user?.username ?? "";
  const editing = draft !== null;

  useEffect(() => {
    if (editing) usernameInput.current?.focus({ preventScroll: true });
  }, [editing]);

  useEffect(() => {
    if (saved) changeUsernameButton.current?.focus();
  }, [saved]);

  function toggleUsernameEditor() {
    setDraft(editing ? null : username);
    setError("");
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || saving) return;

    const trimmed = draft.trim();
    if (trimmed === username) return;
    if (!USERNAME_PATTERN.test(trimmed)) {
      setError("Enter a username with 3–24 letters, numbers, or underscores.");
      return;
    }

    setError("");
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
        <ProfilePictureSettings />
        <div className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="space-y-1">
            <p className="text-sm font-medium">Google account</p>
            <p className="break-words text-sm text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">Username</p>
                <p className="break-words text-sm text-muted-foreground">
                  {username}
                </p>
              </div>
              <Button
                ref={changeUsernameButton}
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={editing}
                aria-controls="username-editor"
                disabled={saving}
                onClick={toggleUsernameEditor}
              >
                {editing ? "Cancel" : "Change username"}
              </Button>
            </div>
            <DisclosurePanel id="username-editor" open={editing}>
              <form onSubmit={save} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="settings-username">New username</Label>
                  <Input
                    id="settings-username"
                    ref={usernameInput}
                    autoComplete="username"
                    aria-describedby={
                      error ? "username-hint username-error" : "username-hint"
                    }
                    aria-invalid={error ? true : undefined}
                    value={draft ?? username}
                    maxLength={24}
                    disabled={saving}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setError("");
                    }}
                  />
                  <p
                    id="username-hint"
                    className="text-sm text-muted-foreground"
                  >
                    Use 3–24 letters, numbers, or underscores.
                  </p>
                </div>
                {error && (
                  <p
                    id="username-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving || !editing || draft.trim() === username}
                >
                  {saving ? "Saving…" : "Save username"}
                </Button>
              </form>
            </DisclosurePanel>
            {saved && (
              <p role="status" className="text-sm">
                Username saved.
              </p>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
