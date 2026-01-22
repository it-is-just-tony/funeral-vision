import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { userQueries, refreshTokenQueries, configQueries } from '../db/index.js';
import {
  authenticate,
  requireApproved,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  AuthUser,
} from '../middleware/auth.js';

const router = Router();

// Configure Google OAuth Strategy
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        // Pass the profile to the callback handler
        // We use 'as any' because we're passing Google Profile, not our AuthUser
        // The actual user handling is done in handleGoogleAuth
        done(null, profile as any);
      }
    )
  );
}
const BCRYPT_ROUNDS = 12;

// Validation middleware
// Note: normalizeEmail with gmail_remove_dots: false preserves dots in Gmail addresses
const validateEmail = body('email').isEmail().normalizeEmail({ gmail_remove_dots: false });
const validatePassword = body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters');
const validateName = body('name').trim().notEmpty().withMessage('Name is required');

interface DbUser {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  avatar_url: string | null;
  google_id: string | null;
  role: string;
  status: string;
  wallet_limit: number;
  created_at: number;
  approved_at: number | null;
  last_login_at: number | null;
}

function formatUserResponse(user: DbUser, walletCount?: number): Omit<AuthUser, 'walletCount'> & { walletCount?: number } {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser['role'],
    status: user.status as AuthUser['status'],
    walletLimit: user.wallet_limit,
    walletCount,
  };
}

/**
 * POST /api/auth/register
 * Register a new user with email and password
 */
router.post(
  '/register',
  [validateEmail, validatePassword, validateName],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, password, name } = req.body;

    try {
      // Check registration mode
      const configResult = configQueries.get.get('registration_mode') as { value: string } | undefined;
      const registrationMode = configResult?.value || 'approval';

      if (registrationMode === 'closed') {
        res.status(403).json({ success: false, error: 'Registration is currently closed', code: 'REGISTRATION_CLOSED' });
        return;
      }

      // Check if email already exists
      const existingUser = userQueries.getByEmail.get(email);
      if (existingUser) {
        res.status(409).json({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });
        return;
      }

      // Get default wallet limit
      const limitConfig = configQueries.get.get('default_wallet_limit') as { value: string } | undefined;
      const defaultLimit = parseInt(limitConfig?.value || '10', 10);

      // Check if this is the owner email
      const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
      const isOwner = ownerEmail && email.toLowerCase() === ownerEmail;

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Create user - owner is always auto-approved
      const userId = uuidv4();
      const now = Date.now();
      const status = isOwner || registrationMode === 'open' ? 'approved' : 'pending';
      const role = isOwner ? 'owner' : 'user';
      const walletLimit = isOwner ? -1 : defaultLimit;

      userQueries.create.run({
        id: userId,
        email,
        password_hash: passwordHash,
        name,
        avatar_url: null,
        google_id: null,
        role,
        status,
        wallet_limit: walletLimit,
        created_at: now,
        updated_at: now,
      });

      const user = userQueries.getById.get(userId) as DbUser;

      // If approved, generate tokens
      if (status === 'approved') {
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

        refreshTokenQueries.create.run({
          id: uuidv4(),
          user_id: userId,
          token_hash: hashToken(refreshToken),
          expires_at: refreshExpiry,
          created_at: now,
        });

        res.status(201).json({
          success: true,
          data: {
            user: formatUserResponse(user, 0),
            accessToken,
            refreshToken,
            expiresIn: 900, // 15 minutes
          },
        });
        return;
      }

      // Pending approval
      res.status(201).json({
        success: true,
        data: {
          user: formatUserResponse(user, 0),
          message: 'Registration successful. Your account is pending admin approval.',
        },
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  }
);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', [validateEmail, validatePassword], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const user = userQueries.getByEmail.get(email) as DbUser | undefined;

    if (!user || !user.password_hash) {
      res.status(401).json({ success: false, error: 'Invalid credentials', code: 'AUTH_INVALID_CREDENTIALS' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials', code: 'AUTH_INVALID_CREDENTIALS' });
      return;
    }

    // Update last login
    userQueries.updateLastLogin.run(Date.now(), user.id);

    // Get wallet count
    const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    refreshTokenQueries.create.run({
      id: uuidv4(),
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      expires_at: refreshExpiry,
      created_at: Date.now(),
    });

    res.json({
      success: true,
      data: {
        user: formatUserResponse(user, walletCountResult.count),
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ success: false, error: 'Refresh token required', code: 'REFRESH_TOKEN_REQUIRED' });
    return;
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const storedToken = refreshTokenQueries.getByHash.get(tokenHash, Date.now()) as {
      id: string;
      user_id: string;
    } | undefined;

    if (!storedToken) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token', code: 'REFRESH_TOKEN_INVALID' });
      return;
    }

    const user = userQueries.getById.get(storedToken.user_id) as DbUser | undefined;
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
      return;
    }

    // Revoke old token and create new one (token rotation)
    refreshTokenQueries.revoke.run(Date.now(), storedToken.id);

    const newRefreshToken = generateRefreshToken();
    const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    refreshTokenQueries.create.run({
      id: uuidv4(),
      user_id: user.id,
      token_hash: hashToken(newRefreshToken),
      expires_at: refreshExpiry,
      created_at: Date.now(),
    });

    const accessToken = generateAccessToken(user);
    const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };

    res.json({
      success: true,
      data: {
        user: formatUserResponse(user, walletCountResult.count),
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
      },
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      const storedToken = refreshTokenQueries.getByHash.get(tokenHash, Date.now()) as { id: string } | undefined;
      if (storedToken) {
        refreshTokenQueries.revoke.run(Date.now(), storedToken.id);
      }
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/logout-all
 * Invalidate all refresh tokens for user (logout all devices)
 */
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    refreshTokenQueries.revokeAllForUser.run(Date.now(), req.user!.id);
    res.json({ success: true, message: 'Logged out from all devices' });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = userQueries.getById.get(req.user!.id) as DbUser | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };

    res.json({
      success: true,
      data: {
        user: formatUserResponse(user, walletCountResult.count),
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

/**
 * PATCH /api/auth/me
 * Update current user profile (name only for now)
 */
router.patch('/me', authenticate, [validateName], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { name } = req.body;

  try {
    userQueries.update.run({
      id: req.user!.id,
      email: null,
      password_hash: null,
      name,
      avatar_url: null,
      google_id: null,
      role: null,
      status: null,
      wallet_limit: null,
      updated_at: Date.now(),
      approved_at: null,
      approved_by: null,
      last_login_at: null,
    });

    const user = userQueries.getById.get(req.user!.id) as DbUser;
    const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };

    res.json({
      success: true,
      data: {
        user: formatUserResponse(user, walletCountResult.count),
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for current user
 */
router.post(
  '/change-password',
  authenticate,
  requireApproved,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = userQueries.getById.get(req.user!.id) as DbUser | undefined;

      if (!user || !user.password_hash) {
        res.status(400).json({ success: false, error: 'Cannot change password for OAuth-only account' });
        return;
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        res.status(401).json({ success: false, error: 'Current password is incorrect' });
        return;
      }

      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      userQueries.update.run({
        id: user.id,
        email: null,
        password_hash: newPasswordHash,
        name: null,
        avatar_url: null,
        google_id: null,
        role: null,
        status: null,
        wallet_limit: null,
        updated_at: Date.now(),
        approved_at: null,
        approved_by: null,
        last_login_at: null,
      });

      // Revoke all refresh tokens (force re-login)
      refreshTokenQueries.revokeAllForUser.run(Date.now(), user.id);

      res.json({ success: true, message: 'Password changed. Please log in again.' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ success: false, error: 'Failed to change password' });
    }
  }
);

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', (req: Request, res: Response, next) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ success: false, error: 'Google OAuth is not configured' });
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get(
  '/google/callback',
  (req: Request, res: Response, next) => {
    passport.authenticate('google', { session: false }, (err: Error | null, profile: GoogleProfile | false) => {
      if (err || !profile) {
        console.error('Google OAuth error:', err);
        return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
      }

      // Handle the Google profile
      handleGoogleAuth(profile, res);
    })(req, res, next);
  }
);

async function handleGoogleAuth(profile: GoogleProfile, res: Response) {
  try {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName || profile.name?.givenName || 'Google User';
    const avatarUrl = profile.photos?.[0]?.value || null;

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Check if user exists with this Google ID
    let user = userQueries.getByGoogleId.get(googleId) as DbUser | undefined;

    if (!user) {
      // Check if user exists with this email (link accounts)
      user = userQueries.getByEmail.get(email) as DbUser | undefined;

      if (user) {
        // Link Google account to existing user
        userQueries.update.run({
          id: user.id,
          email: null,
          password_hash: null,
          name: null,
          avatar_url: avatarUrl,
          google_id: googleId,
          role: null,
          status: null,
          wallet_limit: null,
          updated_at: Date.now(),
          approved_at: null,
          approved_by: null,
          last_login_at: null,
        });
        user = userQueries.getById.get(user.id) as DbUser;
      } else {
        // Create new user
        // Check registration mode
        const configResult = configQueries.get.get('registration_mode') as { value: string } | undefined;
        const registrationMode = configResult?.value || 'approval';

        if (registrationMode === 'closed') {
          return res.redirect(`${FRONTEND_URL}/login?error=registration_closed`);
        }

        // Get default wallet limit
        const limitConfig = configQueries.get.get('default_wallet_limit') as { value: string } | undefined;
        const defaultLimit = parseInt(limitConfig?.value || '10', 10);

        const userId = uuidv4();
        const now = Date.now();
        const status = registrationMode === 'open' ? 'approved' : 'pending';

        userQueries.create.run({
          id: userId,
          email,
          password_hash: null,
          name,
          avatar_url: avatarUrl,
          google_id: googleId,
          role: 'user',
          status,
          wallet_limit: defaultLimit,
          created_at: now,
          updated_at: now,
        });

        user = userQueries.getById.get(userId) as DbUser;

        // If pending, redirect to pending page
        if (status === 'pending') {
          return res.redirect(`${FRONTEND_URL}/pending?new=true`);
        }
      }
    }

    // Check user status
    if (user.status === 'pending') {
      return res.redirect(`${FRONTEND_URL}/pending`);
    }

    if (user.status === 'rejected' || user.status === 'suspended') {
      return res.redirect(`${FRONTEND_URL}/login?error=account_${user.status}`);
    }

    // Update last login
    userQueries.updateLastLogin.run(Date.now(), user.id);

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    refreshTokenQueries.create.run({
      id: uuidv4(),
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      expires_at: refreshExpiry,
      created_at: Date.now(),
    });

    // Redirect to frontend with tokens in query params (will be stored and removed from URL)
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      expiresIn: '900',
    });

    res.redirect(`${FRONTEND_URL}/login?oauth=success&${params.toString()}`);
  } catch (err) {
    console.error('Google OAuth handler error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=server_error`);
  }
}

export default router;
