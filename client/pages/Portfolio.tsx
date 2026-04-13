import { Layout } from "@/components/Layout";
import { Briefcase, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export default function Portfolio() {
  const { user } = useAuth();
  
  // Sort trades by newest first safely
  const sortedTrades = [...(user?.tradeHistory || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Layout>
      <section className="container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Your Portfolio</h1>
              <p className="text-muted-foreground">Track your betting history and past performance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Balance</p>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-black text-foreground">₹{user?.balance.toLocaleString()}</p>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Trades</p>
              <p className="text-4xl font-black text-primary">{user?.tradeHistory.length || 0}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-lg">Trade History</h2>
            </div>
            
            {sortedTrades.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="mb-2">You haven't placed any bets yet!</p>
                <p className="text-sm">Head over to the Markets page to start trading.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedTrades.map((trade, idx) => (
                  <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-primary border-primary/40">
                          {trade.optionName || trade.optionId}
                        </Badge>
                        <span className="font-medium">{trade.marketTitle}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(trade.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 md:text-right">
                      <div className={`flex flex-col items-end ${trade.tradeType === 'buy' ? 'text-destructive' : 'text-green-500'}`}>
                        <div className="flex items-center gap-1 font-bold">
                          {trade.tradeType === 'buy' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          ₹{Math.abs(trade.amount).toFixed(2)}
                        </div>
                        <span className="text-xs uppercase tracking-wider opacity-80">
                          {trade.tradeType}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
