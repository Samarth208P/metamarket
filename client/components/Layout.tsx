import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Search, Menu, X, User, LogOut, Settings, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
  const { user, logout, isGuestUser } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

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
          <Link to="/" className="flex items-center gap-0 font-bold text-xl tracking-tight text-foreground shrink-0">
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
            {showInstallBtn && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleInstallClick} 
                className="h-8 flex items-center gap-1.5 border-primary/40 text-primary hover:bg-primary/5 transition-all px-3 rounded-full"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase font-black">Install App</span>
              </Button>
            )}

            {user ? (
              <>
                {!isGuestUser && (
                  <div className="flex items-center gap-4 mr-2">
                    <Link to="/portfolio" className="flex flex-col items-center group transition-opacity hover:opacity-80">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Portfolio</span>
                      <span className="text-sm font-bold text-yes">₹{user.balance.toLocaleString()}</span>
                    </Link>
                  </div>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0 rounded-full bg-muted border border-border">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                      {isGuestUser ? "Guest Mode" : user.email}
                    </div>
                    <DropdownMenuSeparator />
                    {!isGuestUser && <DropdownMenuItem>
                      <Settings className="w-4 h-4 mr-2" /> Settings
                    </DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => logout()} className="text-destructive">
                      <LogOut className="w-4 h-4 mr-2" /> {isGuestUser ? "Exit Guest Mode" : "Sign Out"}
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

          {/* Mobile Actions */}
          <div className="md:hidden flex items-center gap-2">
            {showInstallBtn && (
              <Button 
                variant="outline"
                size="sm"
                onClick={handleInstallClick} 
                className="h-8 px-3 text-xs font-bold border-primary text-primary hover:bg-primary/10 transition-all rounded-full flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>App</span>
              </Button>
            )}
            <button className="p-2 -mr-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-4">
            {user && !isGuestUser && (
              <Link to="/portfolio" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                <span className="text-sm font-semibold">Portfolio Balance</span>
                <span className="font-bold text-foreground">₹{user.balance.toLocaleString()}</span>
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
              {showInstallBtn && (
                <button
                  onClick={() => { handleInstallClick(); setMobileMenuOpen(false); }}
                  className="text-sm font-bold text-primary py-2 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Install MetaMarket App
                </button>
              )}
            </div>

            {user ? (
              <Button variant="outline" onClick={() => logout()} className="w-full justify-start text-destructive mt-2">
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

      <main className="flex-1">{children}</main>
    </div>
  );
}
