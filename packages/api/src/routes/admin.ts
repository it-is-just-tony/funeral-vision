import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { userQueries, configQueries, db, listBackups, restoreBackup } from '../db/index.js';
import { authenticate, requireRole, requireApproved } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication and admin/owner role
router.use(authenticate);
router.use(requireApproved);
router.use(requireRole('admin', 'owner'));

interface DbUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  status: string;
  wallet_limit: number;
  created_at: number;
  approved_at: number | null;
  approved_by: string | null;
  last_login_at: number | null;
}

function formatAdminUserResponse(user: DbUser, walletCount?: number) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    role: user.role,
    status: user.status,
    walletLimit: user.wallet_limit,
    walletCount,
    createdAt: user.created_at,
    approvedAt: user.approved_at,
    lastLoginAt: user.last_login_at,
  };
}

/**
 * GET /api/admin/users
 * List all users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = userQueries.getAll.all() as DbUser[];

    const usersWithCounts = users.map((user) => {
      const countResult = userQueries.getWalletCount.get(user.id) as { count: number };
      return formatAdminUserResponse(user, countResult.count);
    });

    res.json({ success: true, data: { users: usersWithCounts } });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

/**
 * GET /api/admin/users/pending
 * List users pending approval
 */
router.get('/users/pending', async (req: Request, res: Response) => {
  try {
    const users = userQueries.getPending.all() as DbUser[];

    const usersWithCounts = users.map((user) => {
      const countResult = userQueries.getWalletCount.get(user.id) as { count: number };
      return formatAdminUserResponse(user, countResult.count);
    });

    res.json({ success: true, data: { users: usersWithCounts } });
  } catch (err) {
    console.error('List pending users error:', err);
    res.status(500).json({ success: false, error: 'Failed to list pending users' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get single user details
 */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = userQueries.getById.get(req.params.id) as DbUser | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const countResult = userQueries.getWalletCount.get(user.id) as { count: number };

    res.json({ success: true, data: { user: formatAdminUserResponse(user, countResult.count) } });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

/**
 * POST /api/admin/users/:id/approve
 * Approve a pending user
 */
router.post('/users/:id/approve', async (req: Request, res: Response) => {
  try {
    const user = userQueries.getById.get(req.params.id) as DbUser | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.status !== 'pending') {
      res.status(400).json({ success: false, error: 'User is not pending approval' });
      return;
    }

    const now = Date.now();
    userQueries.approve.run({
      id: user.id,
      approved_at: now,
      approved_by: req.user!.id,
      updated_at: now,
    });

    const updatedUser = userQueries.getById.get(user.id) as DbUser;
    const countResult = userQueries.getWalletCount.get(user.id) as { count: number };

    res.json({
      success: true,
      data: { user: formatAdminUserResponse(updatedUser, countResult.count) },
      message: `User ${user.email} has been approved`,
    });
  } catch (err) {
    console.error('Approve user error:', err);
    res.status(500).json({ success: false, error: 'Failed to approve user' });
  }
});

/**
 * POST /api/admin/users/:id/reject
 * Reject a pending user
 */
router.post('/users/:id/reject', async (req: Request, res: Response) => {
  try {
    const user = userQueries.getById.get(req.params.id) as DbUser | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.role === 'owner') {
      res.status(403).json({ success: false, error: 'Cannot reject owner account' });
      return;
    }

    userQueries.reject.run(Date.now(), user.id);

    res.json({ success: true, message: `User ${user.email} has been rejected` });
  } catch (err) {
    console.error('Reject user error:', err);
    res.status(500).json({ success: false, error: 'Failed to reject user' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user (role, status, wallet_limit)
 */
router.patch(
  '/users/:id',
  [
    body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
    body('status').optional().isIn(['pending', 'approved', 'rejected', 'suspended']).withMessage('Invalid status'),
    body('walletLimit').optional().isInt({ min: -1 }).withMessage('Invalid wallet limit'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const user = userQueries.getById.get(req.params.id) as DbUser | undefined;

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // Prevent modifying owner
      if (user.role === 'owner' && req.user!.role !== 'owner') {
        res.status(403).json({ success: false, error: 'Cannot modify owner account' });
        return;
      }

      // Only owner can set admin role
      if (req.body.role === 'admin' && req.user!.role !== 'owner') {
        res.status(403).json({ success: false, error: 'Only owner can grant admin role' });
        return;
      }

      const { role, status, walletLimit } = req.body;

      userQueries.update.run({
        id: user.id,
        email: null,
        password_hash: null,
        name: null,
        avatar_url: null,
        google_id: null,
        role: role || null,
        status: status || null,
        wallet_limit: walletLimit !== undefined ? walletLimit : null,
        updated_at: Date.now(),
        approved_at: status === 'approved' && user.status !== 'approved' ? Date.now() : null,
        approved_by: status === 'approved' && user.status !== 'approved' ? req.user!.id : null,
        last_login_at: null,
      });

      const updatedUser = userQueries.getById.get(user.id) as DbUser;
      const countResult = userQueries.getWalletCount.get(user.id) as { count: number };

      res.json({ success: true, data: { user: formatAdminUserResponse(updatedUser, countResult.count) } });
    } catch (err) {
      console.error('Update user error:', err);
      res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  }
);

/**
 * DELETE /api/admin/users/:id
 * Delete a user (owner only)
 */
router.delete('/users/:id', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const user = userQueries.getById.get(req.params.id) as DbUser | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.role === 'owner') {
      res.status(403).json({ success: false, error: 'Cannot delete owner account' });
      return;
    }

    // Delete user (cascades to wallets due to foreign key)
    userQueries.delete.run(user.id);

    res.json({ success: true, message: `User ${user.email} has been deleted` });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

/**
 * GET /api/admin/config
 * Get app configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const configs = configQueries.getAll.all() as { key: string; value: string }[];
    const configMap: Record<string, string> = {};
    configs.forEach((c) => {
      configMap[c.key] = c.value;
    });

    res.json({ success: true, data: { config: configMap } });
  } catch (err) {
    console.error('Get config error:', err);
    res.status(500).json({ success: false, error: 'Failed to get config' });
  }
});

/**
 * PATCH /api/admin/config
 * Update app configuration (owner only)
 */
router.patch(
  '/config',
  requireRole('owner'),
  [
    body('registrationMode').optional().isIn(['approval', 'open', 'closed']).withMessage('Invalid registration mode'),
    body('defaultWalletLimit').optional().isInt({ min: 1 }).withMessage('Invalid default wallet limit'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { registrationMode, defaultWalletLimit } = req.body;
      const now = Date.now();

      if (registrationMode) {
        configQueries.set.run({ key: 'registration_mode', value: registrationMode, updated_at: now });
      }

      if (defaultWalletLimit) {
        configQueries.set.run({ key: 'default_wallet_limit', value: String(defaultWalletLimit), updated_at: now });
      }

      // Return updated config
      const configs = configQueries.getAll.all() as { key: string; value: string }[];
      const configMap: Record<string, string> = {};
      configs.forEach((c) => {
        configMap[c.key] = c.value;
      });

      res.json({ success: true, data: { config: configMap } });
    } catch (err) {
      console.error('Update config error:', err);
      res.status(500).json({ success: false, error: 'Failed to update config' });
    }
  }
);

/**
 * GET /api/admin/stats
 * Get system statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const pendingUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'pending'").get() as { count: number };
    const approvedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'approved'").get() as { count: number };
    const totalWallets = db.prepare('SELECT COUNT(*) as count FROM wallets').get() as { count: number };
    const totalTrades = db.prepare('SELECT COUNT(*) as count FROM trades').get() as { count: number };

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: totalUsers.count,
          pendingUsers: pendingUsers.count,
          approvedUsers: approvedUsers.count,
          totalWallets: totalWallets.count,
          totalTrades: totalTrades.count,
        },
      },
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * GET /api/admin/backups
 * List available database backups (owner only)
 */
router.get('/backups', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const backups = listBackups();
    res.json({
      success: true,
      data: {
        backups: backups.map(b => ({
          name: b.name,
          path: b.path,
          size: b.size,
          sizeFormatted: `${(b.size / 1024 / 1024).toFixed(2)} MB`,
          created: b.created.toISOString(),
        })),
      },
    });
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ success: false, error: 'Failed to list backups' });
  }
});

/**
 * POST /api/admin/backups/restore
 * Restore database from a backup (owner only)
 */
router.post('/backups/restore', requireRole('owner'), async (req: Request, res: Response) => {
  const { backupPath } = req.body;

  if (!backupPath) {
    res.status(400).json({ success: false, error: 'Backup path is required' });
    return;
  }

  try {
    const success = restoreBackup(backupPath);
    if (success) {
      res.json({ success: true, message: 'Database restored. Please restart the server.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to restore backup' });
    }
  } catch (err) {
    console.error('Restore backup error:', err);
    res.status(500).json({ success: false, error: 'Failed to restore backup' });
  }
});

export default router;
