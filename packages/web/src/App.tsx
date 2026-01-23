import { useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { Timeframe } from '@funeral-vision/shared';
import { WalletInput } from './components/WalletInput';
import { PnLSummaryCards } from './components/PnLSummaryCards';
import { TradesTable } from './components/TradesTable';
import { PositionsTable } from './components/PositionsTable';
import { TimeframeSelector } from './components/TimeframeSelector';
import { WalletCatalog } from './components/WalletCatalog';
import { StatusLog } from './components/StatusLog';
import { useWalletPnL } from './hooks/useWalletPnL';
import { WalletProfileCard } from './components/WalletProfile';
import { useWalletProfile } from './hooks/useWalletProfile';
import { ProfitableWallets } from './components/ProfitableWallets';
import { useProfitableWallets } from './hooks/useProfitableWallets';
import { useCatalogWallet } from './hooks/useCatalogWallet';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './contexts/AuthContext';
import { calculateFollowScores, prefetchRecentOhlcv } from './api';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import AdminPage from './pages/AdminPage';

type ViewMode = 'catalog' | 'simulation' | 'single';
const AUTH_DISABLED = (import.meta as any)?.env?.VITE_AUTH_DISABLED === 'true';

function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [activeTab, setActiveTab] = useState<'trades' | 'positions' | 'profile'>('positions');
  const [isCalculatingScores, setIsCalculatingScores] = useState(false);
  const [isEditingWallet, setIsEditingWallet] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [useRealData, setUseRealData] = useState(true);

  const { toggleTheme, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { data, isLoading, error, refetch } = useWalletPnL(walletAddress, timeframe);
  const { data: profile, isLoading: isProfileLoading } = useWalletProfile(walletAddress);
  const { wallet: catalogWallet, updateMeta } = useCatalogWallet(walletAddress);
  const { data: profitableWallets = [], isLoading: isLoadingProfitable, refetch: refetchProfitable } = useProfitableWallets({
    timeframe: '30d',
    minTrades: 1,
    minVolume: 0,
    minWinRate: 0,
    limit: 500,
  });

  const handleSelectWallet = (address: string) => {
    setWalletAddress(address);
    setViewMode('single');
  };

  const handleBackToCatalog = () => {
    setWalletAddress('');
    setViewMode('catalog');
  };

  const handleCalculateScores = useCallback(async () => {
    try {
      setIsCalculatingScores(true);
      if (useRealData && !sessionStorage.getItem('fv_ohlcv_prefetch_3d')) {
        try {
          await prefetchRecentOhlcv({ interval: '1m', days: 3 });
          sessionStorage.setItem('fv_ohlcv_prefetch_3d', String(Date.now()));
        } catch (err) {
          console.warn('OHLCV prefetch failed, continuing:', err);
        }
      }
      await calculateFollowScores({ delaySeconds: 5, slippageModel: 'moderate' });
      await refetchProfitable();
    } catch (err) {
      console.error('Failed to calculate follow scores:', err);
    } finally {
      setIsCalculatingScores(false);
    }
  }, [refetchProfitable]);

  const startEditingWallet = () => {
    setEditName(catalogWallet?.name || '');
    setEditEmoji(catalogWallet?.emoji || '👛');
    setIsEditingWallet(true);
  };

  const cancelEditingWallet = () => {
    setIsEditingWallet(false);
    setEditName('');
    setEditEmoji('');
  };

  const saveWalletMeta = async () => {
    try {
      await updateMeta({
        name: editName.trim() || undefined,
        emoji: editEmoji.trim() || undefined,
      });
      setIsEditingWallet(false);
    } catch (err) {
      console.error('Failed to update wallet metadata:', err);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg-primary">
      {/* Header */}
      <header className="border-b border-theme-border sticky top-0 z-10 bg-theme-bg-secondary/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/funeralvision.svg" alt="Solana" className="w-24 h-24" />
              <h1 className="text-xl font-bold gradient-text">Funeral Vision</h1>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex rounded-lg p-1 bg-theme-bg-hover">
                <button
                  onClick={() => setViewMode('catalog')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'catalog'
                      ? 'bg-solana-purple text-white'
                      : 'text-theme-text-secondary hover:text-theme-text-primary'
                  }`}
                >
                  Catalog
                </button>
                <button
                  onClick={() => setViewMode('simulation')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'simulation'
                      ? 'bg-solana-purple text-white'
                      : 'text-theme-text-secondary hover:text-theme-text-primary'
                  }`}
                >
                  Simulation
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'single'
                      ? 'bg-solana-purple text-white'
                      : 'text-theme-text-secondary hover:text-theme-text-primary'
                  }`}
                >
                  Single Wallet
                </button>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="px-3 py-2 rounded-lg transition-colors bg-theme-bg-hover hover:brightness-110 text-sm"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? 'I am a psycho' : 'I am sane'}
              </button>

              {/* User Menu */}
              {!AUTH_DISABLED && (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-bg-hover hover:brightness-110 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-solana-purple/30 flex items-center justify-center text-sm font-medium">
                      {user?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="text-sm text-theme-text-secondary hidden sm:inline">
                      {user?.name || 'User'}
                    </span>
                  </button>

                  {showUserMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowUserMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-theme-border bg-theme-bg-secondary shadow-lg z-20">
                        <div className="p-3 border-b border-theme-border">
                          <p className="text-sm font-medium text-theme-text-primary truncate">
                            {user?.name}
                          </p>
                          <p className="text-xs text-theme-text-muted truncate">
                            {user?.email}
                          </p>
                          {user?.walletLimit !== -1 && (
                            <p className="text-xs text-theme-text-muted mt-1">
                              Wallet limit: {user?.walletLimit}
                            </p>
                          )}
                        </div>
                        <div className="p-1">
                          {(user?.role === 'admin' || user?.role === 'owner') && (
                            <a
                              href="/admin"
                              className="block w-full px-3 py-2 text-left text-sm text-theme-text-secondary hover:bg-theme-bg-hover rounded transition-colors"
                            >
                              Admin Panel
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              logout();
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-theme-bg-hover rounded transition-colors"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {viewMode === 'catalog' && (
          /* Catalog View */
          <WalletCatalog onSelectWallet={handleSelectWallet} />
        )}

        {viewMode === 'simulation' && (
          /* Simulation View */
          <ProfitableWallets
            wallets={profitableWallets}
            isLoading={isLoadingProfitable}
            onSelect={handleSelectWallet}
            onCalculateScores={handleCalculateScores}
            isCalculating={isCalculatingScores}
            useRealData={useRealData}
            onToggleRealData={() => setUseRealData((v) => !v)}
          />
        )}

        {viewMode === 'single' && (
          /* Single Wallet View */
          <>
            {/* Back to Catalog button */}
            <button
              onClick={handleBackToCatalog}
              className="mb-4 text-sm text-theme-text-secondary hover:text-theme-text-primary flex items-center gap-1"
            >
              ← Back to Catalog
            </button>

            {/* Wallet Input */}
            <div className="mb-8">
              <WalletInput
                onSubmit={setWalletAddress}
                isLoading={isLoading}
                initialValue={walletAddress}
              />
            </div>

            {/* Wallet Name Header - shows when wallet is selected and in catalog */}
            {walletAddress && catalogWallet && (
              <div className="mb-6 flex items-center gap-3">
                {isEditingWallet ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editEmoji}
                      onChange={(e) => setEditEmoji(e.target.value)}
                      className="input w-14 text-2xl text-center"
                      maxLength={2}
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input w-64 text-lg"
                      placeholder="Wallet name"
                      autoFocus
                    />
                    <button
                      onClick={saveWalletMeta}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium text-white transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditingWallet}
                      className="btn-secondary text-sm py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{catalogWallet.emoji || '👛'}</span>
                    <h2 className="text-2xl font-semibold text-theme-text-primary">
                      {catalogWallet.name || 'Unnamed Wallet'}
                    </h2>
                    <button
                      onClick={startEditingWallet}
                      className="text-theme-text-muted hover:text-solana-purple transition-colors"
                      title="Edit name and emoji"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6 error-box">
                <p className="font-medium">Error analyzing wallet</p>
                <p className="text-sm mt-1 opacity-80">{error.message}</p>
              </div>
            )}

            {/* Results */}
            {walletAddress && (
              <>
                {/* Timeframe Selector */}
                <div className="mb-6 flex items-center justify-between">
                  <TimeframeSelector
                    value={timeframe}
                    onChange={setTimeframe}
                  />
                  <button
                    onClick={() => refetch()}
                    disabled={isLoading}
                    className="px-4 py-2 bg-solana-purple/20 hover:bg-solana-purple/30 border border-solana-purple/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Syncing...' : 'Refresh'}
                  </button>
                </div>

                {/* PnL Summary Cards */}
                <div className="mb-8">
                  <PnLSummaryCards data={data} isLoading={isLoading} />
                </div>

                {/* Tabs */}
                <div className="mb-6 border-b divider">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab('positions')}
                      className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
                    >
                      Positions ({data?.positions.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('trades')}
                      className={`tab ${activeTab === 'trades' ? 'active' : ''}`}
                    >
                      Trades ({data?.totalTrades || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('profile')}
                      className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
                    >
                      Profile
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'positions' && (
                  <PositionsTable positions={data?.positions || []} isLoading={isLoading} />
                )}
                {activeTab === 'trades' && (
                  <TradesTable
                    walletAddress={walletAddress}
                    timeframe={timeframe}
                  />
                )}
                {activeTab === 'profile' && (
                  <WalletProfileCard profile={profile} isLoading={isProfileLoading} />
                )}
              </>
            )}

            {/* Empty State */}
            {!walletAddress && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📊</div>
                <h2 className="text-2xl font-bold text-theme-text-secondary mb-2">
                  Analyze Any Solana Wallet
                </h2>
                <p className="text-theme-text-muted max-w-md mx-auto">
                  Enter a wallet address above to see trading performance, PnL breakdown,
                  and detailed trade history. All calculations are done in SOL.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-theme-border py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-theme-text-muted">
          <p>- Built without motion -</p>
        </div>
      </footer>

      {/* Status Log - always visible */}
      <StatusLog maxMessages={100} />
    </div>
  );
}

function App() {
  return (
    <Routes>
      {AUTH_DISABLED ? (
        <>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="/pending" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingApprovalPage />} />
        </>
      )}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      {!AUTH_DISABLED && (
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole={['admin', 'owner']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      )}
      {/* Redirect any unknown routes to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
