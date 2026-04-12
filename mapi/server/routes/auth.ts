import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { RequestHandler } from 'express';
import User from '../models/User.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// ── Passport Initialization ─────────────────────────────────────
export function initializePassport() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('⚠️ Google Auth skipped: Missing GOOGLE_CLIENT_ID or SECRET');
    return;
  }

  try {
    passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || (process.env.NODE_ENV === 'production' 
        ? 'https://metamarket-iitr.vercel.app/mapi/auth/google/callback'
        : 'http://localhost:8080/mapi/auth/google/callback'),
      proxy: true
    },
      async (_accessToken, _refreshToken, profile, done) => {
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
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    ) as any);
    console.log('✅ Google Auth strategy initialized');
  } catch (error) {
    console.error('❌ Google Auth initialization failed:', error);
  }
}

// Auth handlers
export const handleGoogleAuth: RequestHandler = (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Auth not configured on server' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
};

export const handleGoogleCallback: RequestHandler = (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err || !user) {
      return res.redirect('/login?error=auth_failed');
    }

    // Set a signed cookie with the userId (stateless auth)
    res.cookie('userId', user.id || user._id, {
      signed: true,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
      sameSite: 'lax'
    });

    res.redirect('/');
  })(req, res, next);
};

export const handleAuthSuccess: RequestHandler = (req, res) => {
  res.redirect('/');
};

export const handleLogout: RequestHandler = (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
};

export const handleGetUser: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).signedCookies?.userId;
    if (userId) {
      const user = await User.findById(userId);
      if (user) return res.json(user);
    }
    res.status(401).json({ error: 'Not authenticated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};