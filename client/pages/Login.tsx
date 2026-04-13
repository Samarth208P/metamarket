import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const { login, isLoading, guestLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    // Check for auth error in URL params
    const error = searchParams.get('error');
    if (error === 'auth_failed') {
      toast({
        title: "Authentication Failed",
        description: "Only @iitr.ac.in emails are allowed or authentication failed.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  const handleGoogleLogin = () => {
    login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/50 shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex items-center justify-center w-20 h-20 mx-auto"
            >
              <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 shadow-sm flex items-center justify-center">
                <img src="/logo.svg" alt="MetaMarket Logo" className="w-12 h-12 object-contain" />
              </div>
            </motion.div>
            <div>
              <CardTitle className="text-2xl font-bold">
                Welcome to <span className="font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 text-transparent bg-clip-text">MetaMarket</span>
              </CardTitle>
              <CardDescription className="text-base">
                IIT Roorkee's Prediction Market Platform
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Sign in with your IITR Google account to continue
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>Only @iitr.ac.in emails allowed</span>
              </div>
            </div>

            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </div>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-medium">Or</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={guestLogin}
              className="w-full text-foreground border-border/60 hover:bg-muted font-bold h-11"
            >
              Continue as Guest
            </Button>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                By signing in, you agree to participate in prediction markets responsibly
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}