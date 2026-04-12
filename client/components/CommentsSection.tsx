import { useState, useEffect } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface CommentsSectionProps {
  marketId: string;
  isLive: boolean;
}

export function CommentsSection({ marketId, isLive }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
  }, [marketId]);

  const fetchComments = async () => {
    try {
      const response = await fetch(`/mapi/markets/${marketId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error("Failed to fetch comments", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please log in to comment", variant: "destructive" });
      return;
    }
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/mapi/markets/${marketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });

      if (response.ok) {
        const comment = await response.json();
        setComments([comment, ...comments]);
        setNewComment("");
      } else {
        toast({ title: "Failed to post comment", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Discussions</h3>
      </div>

      {isLive && user && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="What's your take?"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="flex-1 bg-muted/30 border-border focus-visible:ring-primary/20"
          />
          <Button type="submit" disabled={isSubmitting || !newComment.trim()} size="icon" className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      )}

      <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">No comments yet. Be the first to speak!</p>
        ) : (
          comments.map((comment, idx) => (
            <div key={idx} className="group animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black text-foreground">{comment.userName}</span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-sm text-foreground leading-relaxed">
                {comment.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
