import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'owner';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  walletLimit: number;
  walletCount: number;
  createdAt: number;
  lastLoginAt?: number;
}

interface AppConfig {
  registrationMode: 'approval' | 'open' | 'closed';
  defaultWalletLimit: number;
}

interface Stats {
  totalUsers: number;
  pendingUsers: number;
  totalWallets: number;
}

const API_BASE = '/api';
const ACCESS_TOKEN_KEY = 'fv_access_token';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'users' | 'settings'>('pending');
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editWalletLimit, setEditWalletLimit] = useState<number>(10);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const [usersRes, pendingRes, configRes, statsRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/users`),
        authFetch(`${API_BASE}/admin/users/pending`),
        authFetch(`${API_BASE}/admin/config`),
        authFetch(`${API_BASE}/admin/stats`),
      ]);

      if (!usersRes.ok || !pendingRes.ok || !configRes.ok || !statsRes.ok) {
        throw new Error('Failed to load admin data');
      }

      const [usersData, pendingData, configData, statsData] = await Promise.all([
        usersRes.json(),
        pendingRes.json(),
        configRes.json(),
        statsRes.json(),
      ]);

      if (!usersData.success || !pendingData.success || !configData.success || !statsData.success) {
        throw new Error('Failed to load admin data');
      }

      const usersList = usersData.data?.users ?? [];
      const pendingList = pendingData.data?.users ?? [];
      const configMap = configData.data?.config ?? {};
      const statsPayload = statsData.data?.stats ?? null;

      setUsers(usersList);
      setPendingUsers(pendingList);
      setConfig({
        registrationMode: configMap.registration_mode ?? 'approval',
        defaultWalletLimit: Number(configMap.default_wallet_limit ?? 10),
      });
      setStats(statsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
      navigate('/');
      return;
    }
    loadData();
  }, [user, navigate, loadData]);

  const handleApprove = async (userId: string) => {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to approve user');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user');
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Are you sure you want to reject this user?')) return;
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/reject`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reject user');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject user');
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update user');
      setEditingUser(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleUpdateConfig = async (updates: Partial<AppConfig>) => {
    try {
      const res = await authFetch(`${API_BASE}/admin/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update config');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'admin':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'rejected':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'suspended':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-bg-primary flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg-primary">
      {/* Header */}
      <header className="border-b border-theme-border sticky top-0 z-10 bg-theme-bg-secondary/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-theme-text-secondary hover:text-theme-text-primary"
              >
                ← Back
              </button>
              <h1 className="text-xl font-bold text-theme-text-primary">Admin Panel</h1>
            </div>
            {stats && (
              <div className="flex gap-6 text-sm">
                <div className="text-theme-text-secondary">
                  <span className="text-theme-text-primary font-medium">{stats.totalUsers}</span> users
                </div>
                <div className="text-theme-text-secondary">
                  <span className="text-yellow-400 font-medium">{stats.pendingUsers}</span> pending
                </div>
                <div className="text-theme-text-secondary">
                  <span className="text-theme-text-primary font-medium">{stats.totalWallets}</span> wallets
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-theme-border">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-solana-purple text-solana-purple'
                  : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              Pending Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-solana-purple text-solana-purple'
                  : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-solana-purple text-solana-purple'
                  : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Pending Approvals Tab */}
        {activeTab === 'pending' && (
          <div>
            {pendingUsers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">✓</div>
                <p className="text-theme-text-secondary">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((u) => (
                  <div
                    key={u.id}
                    className="card p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-theme-text-primary">{u.name}</span>
                        <span className="text-sm text-theme-text-muted">{u.email}</span>
                      </div>
                      <div className="text-xs text-theme-text-muted mt-1">
                        Registered {formatDate(u.createdAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(u.id)}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium text-white transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(u.id)}
                        className="px-4 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded text-sm font-medium text-red-400 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Users Tab */}
        {activeTab === 'users' && (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-theme-border text-left text-sm text-theme-text-secondary">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Wallets</th>
                  <th className="px-4 py-3 font-medium">Last Login</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-theme-border/50 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-theme-text-primary">{u.name}</div>
                      <div className="text-xs text-theme-text-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getRoleBadgeColor(
                          u.role
                        )}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeColor(
                          u.status
                        )}`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingUser === u.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editWalletLimit}
                            onChange={(e) => setEditWalletLimit(parseInt(e.target.value) || 0)}
                            className="input w-20 text-sm py-1"
                            min="-1"
                          />
                          <button
                            onClick={() => handleUpdateUser(u.id, { walletLimit: editWalletLimit })}
                            className="text-green-400 hover:text-green-300 text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            className="text-theme-text-muted hover:text-theme-text-secondary text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-theme-text-secondary">
                          {u.walletCount} / {u.walletLimit === -1 ? '∞' : u.walletLimit}
                          {u.role !== 'owner' && (
                            <button
                              onClick={() => {
                                setEditWalletLimit(u.walletLimit);
                                setEditingUser(u.id);
                              }}
                              className="ml-2 text-theme-text-muted hover:text-solana-purple text-xs"
                            >
                              Edit
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-theme-text-muted">
                      {formatDate(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3">
                      {u.role !== 'owner' && (
                        <div className="flex gap-2">
                          {u.status === 'approved' && (
                            <button
                              onClick={() => handleUpdateUser(u.id, { status: 'suspended' })}
                              className="text-xs text-orange-400 hover:text-orange-300"
                            >
                              Suspend
                            </button>
                          )}
                          {u.status === 'suspended' && (
                            <button
                              onClick={() => handleUpdateUser(u.id, { status: 'approved' })}
                              className="text-xs text-green-400 hover:text-green-300"
                            >
                              Unsuspend
                            </button>
                          )}
                          {u.role === 'user' && user?.role === 'owner' && (
                            <button
                              onClick={() => handleUpdateUser(u.id, { role: 'admin' })}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Make Admin
                            </button>
                          )}
                          {u.role === 'admin' && user?.role === 'owner' && (
                            <button
                              onClick={() => handleUpdateUser(u.id, { role: 'user' })}
                              className="text-xs text-theme-text-muted hover:text-theme-text-secondary"
                            >
                              Remove Admin
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && config && (
          <div className="card p-6 max-w-lg">
            <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
              Registration Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-theme-text-secondary mb-2">
                  Registration Mode
                </label>
                <select
                  value={config.registrationMode}
                  onChange={(e) =>
                    handleUpdateConfig({
                      registrationMode: e.target.value as AppConfig['registrationMode'],
                    })
                  }
                  className="input w-full"
                >
                  <option value="approval">Require Approval</option>
                  <option value="open">Open Registration</option>
                  <option value="closed">Closed (No new registrations)</option>
                </select>
                <p className="text-xs text-theme-text-muted mt-1">
                  {config.registrationMode === 'approval' &&
                    'New users must be approved by an admin before accessing the app.'}
                  {config.registrationMode === 'open' &&
                    'Anyone can register and immediately access the app.'}
                  {config.registrationMode === 'closed' &&
                    'Registration is disabled. Only existing users can access the app.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-text-secondary mb-2">
                  Default Wallet Limit
                </label>
                <input
                  type="number"
                  value={config.defaultWalletLimit}
                  onChange={(e) =>
                    handleUpdateConfig({
                      defaultWalletLimit: parseInt(e.target.value) || 10,
                    })
                  }
                  className="input w-32"
                  min="1"
                />
                <p className="text-xs text-theme-text-muted mt-1">
                  Maximum number of wallets new users can add. Set to -1 for unlimited.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
