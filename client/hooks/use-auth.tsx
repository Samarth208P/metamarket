import React, { createContext, useContext, useState, useEffect } from "react";
import type { AuthErrorResponse, OnboardingRequest, User } from "@shared/api";

interface AuthContextType {
  user: User | null;
  login: () => void;
  logout: () => Promise<void>;
  updateUser: (userData: User) => void;
  refreshUser: () => Promise<void>;
  toggleBookmark: (marketId: string) => void;
  bookmarks: string[];
  isLoading: boolean;
  completeOnboarding: (data: OnboardingRequest) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  acknowledgeStarterGift: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function requireSuccess(response: Response) {
  if (response.ok) return;
  const data: AuthErrorResponse | undefined = await response
    .json()
    .catch(() => undefined);
  throw new Error(data?.error || "Unable to complete this request. Try again.");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("metamarket_bookmarks");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to parse initial bookmarks", e);
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Sync bookmarks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("metamarket_bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    // Check if user is already authenticated on page load
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch("/mapi/user", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    // Redirect to Google OAuth
    window.location.href = "/mapi/auth/google";
  };

  const logout = async () => {
    await requireSuccess(
      await fetch("/mapi/auth/logout", {
        method: "POST",
        credentials: "include",
      }),
    );
    setUser(null);
  };

  const updateUser = (userData: User) => {
    setUser((current) => {
      if (current?.id !== userData.id) return current;
      return {
        ...userData,
        starterGift: current.starterGift && userData.starterGift,
      };
    });
  };

  const refreshUser = async () => {
    try {
      const response = await fetch("/mapi/user", { credentials: "include" });
      if (response.ok) {
        const userData = await response.json();
        updateUser(userData);
      } else if (response.status === 401) {
        setUser((current) => (current?.id === user?.id ? null : current));
      }
    } catch (error) {
      console.error("Manual user refresh failed:", error);
    }
  };

  const toggleBookmark = (marketId: string) => {
    setBookmarks((prev) =>
      prev.includes(marketId)
        ? prev.filter((id) => id !== marketId)
        : [...prev, marketId],
    );
  };

  const clearHistory = async () => {
    try {
      const response = await fetch("/mapi/auth/clear-history", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          updateUser(data.user);
        } else {
          await refreshUser();
        }
      }
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const completeOnboarding = async (data: OnboardingRequest) => {
    const response = await fetch("/mapi/user/onboarding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await requireSuccess(response);
    const account: User = await response.json();
    setUser((current) => (current?.id === account.id ? account : current));
  };

  const acknowledgeStarterGift = async () => {
    await requireSuccess(
      await fetch("/mapi/user/starter-gift/acknowledge", {
        method: "POST",
        credentials: "include",
      }),
    );
    setUser((current) =>
      current?.id === user?.id && current
        ? { ...current, starterGift: null }
        : current,
    );
  };

  const updateUsername = async (username: string) => {
    const response = await fetch("/mapi/user/username", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    await requireSuccess(response);
    const profile: { username: string } = await response.json();
    setUser((current) =>
      current && current.id === user?.id
        ? { ...current, username: profile.username }
        : current,
    );
  };

  const value = {
    user,
    login,
    logout,
    updateUser,
    refreshUser,
    toggleBookmark,
    bookmarks,
    isLoading,
    clearHistory,
    completeOnboarding,
    updateUsername,
    acknowledgeStarterGift,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
