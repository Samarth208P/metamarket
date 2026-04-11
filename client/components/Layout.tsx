import { Link } from "react-router-dom";
import { Menu, X, User, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
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
  const { user, logout } = useAuth();

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
          <Link to="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground">
            <img src="/Frame.svg" alt="MetaMarket" className="w-5 h-5 object-contain" />
            MetaMarket
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 ml-6 flex-1">
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

          {/* Desktop User Info */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link to="/portfolio" className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 hover:bg-muted rounded-md transition-colors font-semibold text-sm">
                  Portfolio <span className="text-foreground">₹{user.balance.toLocaleString()}</span>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0 rounded-full bg-muted border border-border">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                      {user.email}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Settings className="w-4 h-4 mr-2" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => logout()} className="text-destructive">
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

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2 -mr-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-4">
            {user && (
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