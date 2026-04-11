import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { RequestHandler } from 'express';
import User from '../models/User';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// ── Defensive Passport Initialization ─────────────────────────────────────
export function initializePassport() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('⚠️ Google Auth skipped: Missing GOOGLE_CLIENT_ID or SECRET');
    return;
  }

  try {
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.NODE_ENV === 'production' 
          ? 'https://metamarket-iitr.vercel.app/auth/google/callback'
          : '/auth/google/callback',
        proxy: true
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email || (!email.endsWith('@iitr.ac.in') && !email.endsWith('@mt.iitr.ac.in'))) {
            return done(null, false, { message: 'Only IITR emails allowed' });
          }

          const enrollmentNumber = email.split('@')[0];
          const isAdmin = email === 'samarth_p@mt.iitr.ac.in';

          const user = await User.findOneAndUpdate(
            { googleId: profile.id },
            {
              googleId: profile.id,
              email,
              name: profile.displayName || enrollmentNumber,
              enrollmentNumber,
              isAdmin,
            },
            {
              new: true,
              upsert: true,
              setDefaultsOnInsert: true,
            }
          );

          return done(null, user);
        } catch (error) {
          return done(error as Error, null);
        }
      }
    ) as any);
    console.log('✅ Google Auth strategy initialized');
  } catch (error) {
    console.error('❌ Google Auth initialization failed:', error);
  }
}

// Keep standard Passport serialization logic
passport.serializeUser((user: any, done) => {
  done(null, user.id || user._id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    if (!user) return done(new Error('User not found'));
    done(null, user);
  } catch (error) {
    done(error as Error, null);
  }
});

// Auth handlers
export const handleGoogleAuth: RequestHandler = (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Auth not configured on server' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

export const handleGoogleCallback: RequestHandler = (req, res, next) => {
  passport.authenticate('google', {
    failureRedirect: '/login?error=auth_failed',
    successRedirect: '/'
  })(req, res, next);
};

export const handleLogout: RequestHandler = (req, res) => {
  req.logout(() => res.json({ success: true }));
};

export const handleGetUser: RequestHandler = (req, res) => {
  if (req.user) res.json(req.user);
  else res.status(401).json({ error: 'Not authenticated' });
};