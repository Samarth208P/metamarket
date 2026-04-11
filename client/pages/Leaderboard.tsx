import { Layout } from "@/components/Layout";
import { Trophy, Medal, Award, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LeaderboardUser } from "@shared/api";

async function fetchLeaderboard(): Promise<LeaderboardUser[]> {
  const response = await fetch("/api/leaderboard", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load leaderboard");
  }

  return response.json();
}

export default function Leaderboard() {
  const { data: users = [], isLoading, isError } = useQuery<LeaderboardUser[]>({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 15000,
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-lg font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-12">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-6">
              <Trophy className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">IITR Leaderboard</h1>
            <p className="text-lg text-muted-foreground mb-8">
              Top performers in MetaMarket prediction trading
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Loading leaderboard...</p>
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
                  <Card className={`transition-all hover:shadow-lg ${user.rank <= 3 ? 'border-primary/50 bg-primary/5' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-12 h-12">
                            {getRankIcon(user.rank)}
                          </div>
                          <Avatar className="w-10 h-10">
                            <AvatarFallback>{user.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-foreground">{user.name}</h3>
                            <p className="text-sm text-muted-foreground">{user.enrollmentNumber}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <span className="text-2xl font-bold text-foreground">₹{user.balance.toLocaleString()}</span>
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
