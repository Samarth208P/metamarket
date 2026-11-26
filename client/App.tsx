import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Link,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Portfolio from "./pages/Portfolio";
import Leaderboard from "./pages/Leaderboard";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import { Layout } from "@/components/Layout";
import { MarketErrorBoundary } from "@/components/MarketErrorBoundary";
import { MarketNotifications } from "@/components/MarketNotifications";
import { BINARY_ASSETS, BINARY_ASSET_PAIRS } from "@shared/binaryAssets";
import { RAMAYANA_MARKET_ID, RAMAYANA_PATH } from "@shared/ramayana";

import { lazy, Suspense, useEffect, type ReactNode } from "react";

const MarketDetail = lazy(() => import("./pages/MarketDetail"));
const BinaryMarket = lazy(() => import("./pages/BinaryMarket"));
const RamayanaMarket = lazy(() => import("./pages/RamayanaMarket"));

const queryClient = new QueryClient();

function MarketRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <MarketErrorBoundary
      key={pathname}
      market={pathname}
      fallback={
        <Layout>
          <main className="container px-4 py-8">
            <p className="mb-3" role="alert">
              This market is temporarily unavailable.
            </p>
            <Link to="/" className="text-primary">
              Back to markets
            </Link>
          </main>
        </Layout>
      }
    >
      <Suspense
        fallback={
          <p className="p-8" role="status">
            Loading market…
          </p>
        }
      >
        {children}
      </Suspense>
    </MarketErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    // Force dark mode as default for the premium look
    document.documentElement.classList.add("dark");
    const keyboard = () => {
      document.documentElement.dataset.input = "keyboard";
    };
    const pointer = () => {
      delete document.documentElement.dataset.input;
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <MarketNotifications />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/portfolio"
                element={
                  <ProtectedRoute>
                    <Portfolio />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leaderboard"
                element={
                  <ProtectedRoute>
                    <Leaderboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path={RAMAYANA_PATH}
                element={
                  <ProtectedRoute>
                    <MarketRoute>
                      <RamayanaMarket />
                    </MarketRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path={`/market/${RAMAYANA_MARKET_ID}`}
                element={<Navigate to={RAMAYANA_PATH} replace />}
              />
              <Route
                path="/market/:id"
                element={
                  <ProtectedRoute>
                    <MarketRoute>
                      <MarketDetail />
                    </MarketRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminProtectedRoute>
                    <Admin />
                  </AdminProtectedRoute>
                }
              />
              {BINARY_ASSET_PAIRS.map((pair) => (
                <Route
                  key={pair}
                  path={BINARY_ASSETS[pair].path}
                  element={
                    <ProtectedRoute>
                      <MarketRoute>
                        <BinaryMarket assetPair={pair} />
                      </MarketRoute>
                    </ProtectedRoute>
                  }
                />
              ))}
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <NotFound />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

declare global {
  interface Window {
    __app_root_initialized__?: boolean;
  }
}

const container = document.getElementById("root");
if (container && !window.__app_root_initialized__) {
  window.__app_root_initialized__ = true;
  createRoot(container).render(<App />);
}
