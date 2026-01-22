import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { userQueries } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'owner';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  walletLimit: number;
  walletCount?: number;
}

// Extend Express and Passport User to include our custom properties
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends AuthUser {}
  }
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verify JWT token and attach user to request
 */
export const authenticate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided', code: 'AUTH_NO_TOKEN' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Get fresh user data from database
    const user = userQueries.getById.get(decoded.sub) as {
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      wallet_limit: number;
    } | undefined;

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found', code: 'AUTH_USER_NOT_FOUND' });
      return;
    }

    // Get wallet count
    const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as AuthUser['role'],
      status: user.status as AuthUser['status'],
      walletLimit: user.wallet_limit,
      walletCount: walletCountResult.count,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired', code: 'AUTH_TOKEN_EXPIRED' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'AUTH_TOKEN_INVALID' });
      return;
    }
    next(err);
  }
};

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    const user = userQueries.getById.get(decoded.sub) as {
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      wallet_limit: number;
    } | undefined;

    if (user) {
      const walletCountResult = userQueries.getWalletCount.get(user.id) as { count: number };
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as AuthUser['role'],
        status: user.status as AuthUser['status'],
        walletLimit: user.wallet_limit,
        walletCount: walletCountResult.count,
      };
    }
  } catch {
    // Ignore token errors for optional auth
  }

  next();
};

/**
 * Require user to have approved status
 */
export const requireApproved: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  if (req.user.status === 'pending') {
    res.status(403).json({
      success: false,
      error: 'Account pending approval',
      code: 'AUTH_PENDING_APPROVAL',
      user: { status: req.user.status },
    });
    return;
  }

  if (req.user.status === 'rejected') {
    res.status(403).json({ success: false, error: 'Account rejected', code: 'AUTH_REJECTED' });
    return;
  }

  if (req.user.status === 'suspended') {
    res.status(403).json({ success: false, error: 'Account suspended', code: 'AUTH_SUSPENDED' });
    return;
  }

  next();
};

/**
 * Require user to have specific role(s)
 */
export const requireRole = (...roles: Array<'user' | 'admin' | 'owner'>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    // Owner always has access
    if (req.user.role === 'owner') {
      next();
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'AUTH_FORBIDDEN' });
      return;
    }

    next();
  };
};

/**
 * Check if user can add more wallets (under their limit)
 */
export const checkWalletLimit: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  // -1 means unlimited (owner)
  if (req.user.walletLimit === -1) {
    next();
    return;
  }

  const currentCount = req.user.walletCount || 0;

  // For single wallet adds
  if (currentCount >= req.user.walletLimit) {
    res.status(403).json({
      success: false,
      error: `Wallet limit reached. You can track up to ${req.user.walletLimit} wallets.`,
      code: 'WALLET_LIMIT_REACHED',
      limit: req.user.walletLimit,
      current: currentCount,
    });
    return;
  }

  next();
};

/**
 * Generate JWT access token
 */
export function generateAccessToken(user: { id: string; email: string; role: string }): string {
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '15m';
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Generate refresh token (longer-lived)
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hash a refresh token for storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
