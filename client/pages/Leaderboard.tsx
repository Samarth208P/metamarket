import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Trophy, Medal, Award, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeaderboardUser } from "@shared/api";

async function fetchLeaderboard(): Promise<LeaderboardUser[]> {
  const response = await fetch("/mapi/leaderboard", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load leaderboard");
  }

  return response.json();
}

export default function Leaderboard() {
  const [isBranding, setIsBranding] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsBranding(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const { data: users = [], isLoading: isQueryLoading, isError } = useQuery<LeaderboardUser[]>({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 15000,
  });

  const isLoading = isQueryLoading || isBranding;

  const getRankIndicator = (trend: number) => {
    if (trend > 0) return <span className="text-xs font-bold text-green-500 ml-1">▲ {trend}</span>;
    if (trend < 0) return <span className="text-xs font-bold text-red-500 ml-1">▼ {Math.abs(trend)}</span>;
    return null;
  };

  const getRankBorder = (rank: number) => {
    switch (rank) {
      case 1:
        return "border-yellow-400 border-2 shadow-[0_0_20px_rgba(250,204,21,0.2)] bg-yellow-400/5";
      case 2:
        return "border-slate-300 border-2 shadow-[0_0_15px_rgba(203,213,225,0.15)] bg-slate-300/5";
      case 3:
        return "border-amber-600 border-2 shadow-[0_0_15px_rgba(217,119,6,0.15)] bg-amber-600/5";
      default:
        return "border-border hover:border-primary/30";
    }
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-12">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-2">
              <Trophy className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">IITR Leaderboard</h1>
            <p className="text-lg text-muted-foreground mb-8">
              Top performers in MetaMarket prediction trading
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <img src="/animated-logo.svg" alt="Loading" className="w-32 h-32" />
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading Rankings</p>
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Unable to load leaderboard.</p>
            </div>
          ) : users.length > 0 ? (
            <div className="space-y-4">
              {users.map((user) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className={`transition-all hover:shadow-lg ${getRankBorder(user.rank)}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center w-12 h-12">
                            <span className="text-2xl font-black text-foreground">#{user.rank}</span>
                            {getRankIndicator(user.rankTrend)}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-foreground">{user.name}</h3>
                            <p className="text-sm font-medium text-muted-foreground">{user.enrollmentNumber}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-2xl font-black text-foreground">₹{user.totalNetWorth.toLocaleString()}</span>
                            <div className="flex gap-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-1">
                              <span>Cash: ₹{user.balance.toLocaleString()}</span>
                              <span className="text-primary/40">•</span>
                              <span>Holdings: ₹{user.holdingsValue.toLocaleString()}</span>
                            </div>
                          </div>
                          {user.rank <= 3 && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary mt-2 inline-flex">
                              Top {user.rank}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mx-auto mb-4">
                <Trophy className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No rankings available</h3>
              <p className="text-muted-foreground">Rankings will appear once users start trading.</p>
            </div>
          )}
        </motion.div>
      </section>
    </Layout>
  );
}
