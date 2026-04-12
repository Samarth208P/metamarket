import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@shared/api';

interface AuthContextType {
  user: User | null;
  login: () => void;
  logout: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
  updateUser: (userData: User) => void;
  refreshUser: () => Promise<void>;
  toggleBookmark: (marketId: string) => void;
  bookmarks: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load bookmarks from localStorage
    try {
      const stored = localStorage.getItem('metamarket_bookmarks');
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load bookmarks", e);
    }
    
    // Check if user is already authenticated on page load
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/mapi/user', {
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    // Redirect to Google OAuth
    window.location.href = '/mapi/auth/google';
  };

  const logout = async () => {
    try {
      await fetch('/mapi/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateUser = (userData: User) => {
    setUser(userData);
  };

  const refreshUser = async () => {
    try {
      const response = await fetch('/mapi/user', { credentials: 'include' });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Manual user refresh failed:', error);
    }
  };

  const updateBalance = (newBalance: number) => {
    if (user) {
      setUser({ ...user, balance: newBalance });
    }
  };

  const toggleBookmark = (marketId: string) => {
    setBookmarks(prev => {
      const newBookmarks = prev.includes(marketId)
        ? prev.filter(id => id !== marketId)
        : [...prev, marketId];
      
      localStorage.setItem('metamarket_bookmarks', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  const value = {
    user,
    login,
    logout,
    updateBalance,
    updateUser,
    refreshUser,
    toggleBookmark,
    bookmarks,
    isAuthenticated: !!user,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}