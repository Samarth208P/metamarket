import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { RequestHandler } from 'express';
import User from '../models/User';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Configure Passport Google Strategy
// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID!,
    clientSecret: GOOGLE_CLIENT_SECRET!,
    callbackURL: '/auth/google/callback'
  },
  async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email || (!email.endsWith('@iitr.ac.in') && !email.endsWith('@mt.iitr.ac.in'))) {
        return done(new Error('Only @iitr.ac.in and @mt.iitr.ac.in emails are allowed'), null);
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

      if (!user) {
        return done(new Error('Failed to create or find user'), null);
      }

      return done(null, user);
    } catch (error) {
      return done(error as Error, null);
    }
  }
) as any);

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id || user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    if (!user) {
      return done(new Error('User not found'));
    }
    return done(null, user);
  } catch (error) {
    return done(error as Error, null);
  }
});

// Auth routes
export const handleGoogleAuth: RequestHandler = passport.authenticate('google', {
  scope: ['profile', 'email']
});

export const handleGoogleCallback: RequestHandler = passport.authenticate('google', {
  failureRedirect: '/login?error=auth_failed'
});

export const handleAuthSuccess: RequestHandler = (req, res) => {
  if (req.user) {
    res.redirect('/'); // Redirect to frontend home
  } else {
    res.redirect('/login?error=auth_failed');
  }
};

export const handleLogout: RequestHandler = (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.json({ success: true });
  });
};

export const handleGetUser: RequestHandler = (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};