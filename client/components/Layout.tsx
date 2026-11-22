import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Search, Menu, X, LogOut, Settings, Gift } from "lucide-react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/NotificationCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const signOut = () =>
    logout().catch(() => {
      toast({ title: "Sign-out failed. Try again.", variant: "destructive" });
    });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate(`/`);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchQuery(params.get("q") || "");
  }, [location.search]);

  const navLinks = [
    { label: "Markets", href: "/" },
    { label: "Leaderboard", href: "/leaderboard" },
  ];

  const adminNavLinks = [...navLinks, { label: "Admin", href: "/admin" }];
  const currentNavLinks = user?.isAdmin ? adminNavLinks : navLinks;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Flat, solid header like Polymarket */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo - Text only, clean */}
          <Link
            to="/"
            className="flex items-center gap-0 font-bold text-xl tracking-tight text-foreground shrink-0"
          >
            <img src="/logo.svg" alt="logo" className="w-10 h-10" />
            <span className="tracking-tight -ml-1.5">etaMarket</span>
          </Link>

          {/* Search Bar - Now next to logo */}
          <div className="hidden md:flex flex-1 max-w-md ml-8 mr-auto">
            <form onSubmit={handleSearch} className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 bg-muted/40 border-none h-9 text-sm rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus:bg-muted font-medium"
              />
            </form>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6 ml-6 whitespace-nowrap">
            {currentNavLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-6 ml-auto pl-6 border-l border-border/50">
            {user ? (
              <>
                <div className="flex items-center gap-4 mr-2">
                  <Link
                    to="/portfolio"
                    className="flex flex-col items-center group transition-opacity hover:opacity-80"
                  >
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">
                      Portfolio
                    </span>
                    <span className="text-sm font-bold text-yes">
                      ₹{user.balance.toLocaleString()}
                    </span>
                  </Link>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      aria-label="Account menu"
                      className="h-8 w-8 rounded-full p-0"
                    >
                      <ProfileAvatar
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                      <span className="block truncate font-semibold text-foreground">
                        {user.username}
                      </span>
                      <span className="block truncate">{user.email}</span>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/settings">
                        <Settings className="w-4 h-4 mr-2" /> Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={signOut}
                      className="text-destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link to="/login">
                <Button className="h-8 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md">
                  Log In
                </Button>
              </Link>
            )}
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            {user && <NotificationCenter />}
            {user && (
              <Link
                to="/settings"
                aria-label="Account settings"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                onClick={() => setMobileMenuOpen(false)}
              >
                <ProfileAvatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                />
              </Link>
            )}
            <button
              type="button"
              aria-label="Navigation menu"
              aria-expanded={mobileMenuOpen}
              className="-mr-2 rounded-md p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-4">
            {user && (
              <Link
                to="/portfolio"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
              >
                <span className="text-sm font-semibold">Portfolio Balance</span>
                <span className="font-bold text-foreground">
                  ₹{user.balance.toLocaleString()}
                </span>
              </Link>
            )}

            <div className="flex flex-col gap-2">
              {currentNavLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              {user && (
                <Link
                  to="/settings"
                  className="flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </Link>
              )}
            </div>

            {user ? (
              <Button
                variant="outline"
                onClick={signOut}
                className="w-full justify-start text-destructive mt-2"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            ) : (
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full font-bold">Log In</Button>
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        {user?.starterGift && (
          <StarterGift key={user.id} amount={user.starterGift.amount} />
        )}
        {children}
      </main>
    </div>
  );
}

function StarterGift({ amount }: { amount: number }) {
  const { acknowledgeStarterGift } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function dismiss() {
    setPending(true);
    setError("");
    try {
      await acknowledgeStarterGift();
    } catch {
      setError("Could not dismiss the gift. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="container px-4 pt-4">
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 sm:px-4">
        <Gift className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1">
          <p role="status" className="text-sm font-medium">
            Starter gift:{" "}
            <AnimatedShinyText
              className="whitespace-nowrap font-bold"
              shimmerWidth={32}
            >
              ₹{amount.toLocaleString("en-IN")}
            </AnimatedShinyText>{" "}
            in play money added to your balance.
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={dismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
