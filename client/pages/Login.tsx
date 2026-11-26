import { useEffect, useState, type FormEvent } from "react";
import { PLAY_TERMS, USERNAME_PATTERN } from "@shared/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Navigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const { login, isLoading, user } = useAuth();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    // Check for auth error in URL params
    const error = searchParams.get("error");
    if (error === "auth_failed") {
      toast({
        title: "Authentication Failed",
        description:
          "Google sign-in could not be completed. Try again with a verified Google account.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  if (user && !user.needsOnboarding) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-border/50 shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="flex items-center justify-center w-20 h-20 mx-auto">
              <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 shadow-sm flex items-center justify-center">
                <img
                  src="/logo.svg"
                  alt="MetaMarket Logo"
                  className="w-12 h-12 object-contain"
                />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">
                {user ? "Set up your profile" : "Welcome to MetaMarket"}
              </CardTitle>
              <CardDescription className="text-base">
                {user ? (
                  <span className="break-all">{user.email}</span>
                ) : (
                  "Play-money prediction markets"
                )}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {user ? (
              <OnboardingForm
                key={user.id}
                initialUsername={user.username ?? ""}
              />
            ) : (
              <Button
                onClick={login}
                disabled={isLoading}
                className="w-full h-12 text-base font-medium"
                size="lg"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin" />
                    Checking sign-in…
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </div>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OnboardingForm({ initialUsername }: { initialUsername: string }) {
  const { completeOnboarding, logout } = useAuth();
  const [username, setUsername] = useState(initialUsername);
  const [virtualFunds, setVirtualFunds] = useState(false);
  const [playOnly, setPlayOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await completeOnboarding({ username, virtualFunds, playOnly });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save your profile. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={24}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-describedby="username-help"
          disabled={pending}
        />
        <p id="username-help" className="text-xs text-muted-foreground">
          Use 3–24 letters, numbers, or underscores. This name appears on the
          leaderboard and in comments.
        </p>
      </div>

      <fieldset className="group space-y-2 pt-2" disabled={pending}>
        <legend className="text-sm font-medium">Terms of play</legend>
        <label
          htmlFor="virtual-funds"
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm leading-5 group-disabled:cursor-not-allowed"
        >
          <Checkbox
            id="virtual-funds"
            className="mt-0.5"
            required
            checked={virtualFunds}
            onCheckedChange={(checked) => setVirtualFunds(checked === true)}
          />
          {PLAY_TERMS.virtualFunds}
        </label>
        <label
          htmlFor="play-only"
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm leading-5 group-disabled:cursor-not-allowed"
        >
          <Checkbox
            id="play-only"
            className="mt-0.5"
            required
            checked={playOnly}
            onCheckedChange={(checked) => setPlayOnly(checked === true)}
          />
          {PLAY_TERMS.playOnly}
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        type="submit"
        disabled={
          pending ||
          !USERNAME_PATTERN.test(username.trim()) ||
          !virtualFunds ||
          !playOnly
        }
      >
        {pending ? "Saving profile…" : "Start playing"}
      </Button>
      <Button
        className="w-full"
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          logout().catch(() => setError("Sign-out failed. Try again."))
        }
      >
        Sign out
      </Button>
    </form>
  );
}
