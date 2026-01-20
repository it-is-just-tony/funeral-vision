import { useState, useCallback } from 'react';
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
import { calculateFollowScores } from './api';

type ViewMode = 'catalog' | 'simulation' | 'single';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [activeTab, setActiveTab] = useState<'trades' | 'positions' | 'profile'>('positions');
  const [isCalculatingScores, setIsCalculatingScores] = useState(false);
  const [isEditingWallet, setIsEditingWallet] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');

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
    <div className="min-h-screen bg-solana-dark">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/funeralvision.svg" alt="Solana" className="w-24 h-24" />
              <h1 className="text-xl font-bold gradient-text">Funeral Vision</h1>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('catalog')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'catalog'
                      ? 'bg-solana-purple text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Catalog
                </button>
                <button
                  onClick={() => setViewMode('simulation')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'simulation'
                      ? 'bg-solana-purple text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Simulation
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'single'
                      ? 'bg-solana-purple text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Single Wallet
                </button>
              </div>
              <div className="text-sm text-gray-400">
                v1.0.0
              </div>
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
          />
        )}

        {viewMode === 'single' && (
          /* Single Wallet View */
          <>
            {/* Back to Catalog button */}
            <button
              onClick={handleBackToCatalog}
              className="mb-4 text-sm text-gray-400 hover:text-white flex items-center gap-1"
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
                      className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-2xl text-center"
                      maxLength={2}
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-64 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-lg"
                      placeholder="Wallet name"
                      autoFocus
                    />
                    <button
                      onClick={saveWalletMeta}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditingWallet}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{catalogWallet.emoji || '👛'}</span>
                    <h2 className="text-2xl font-semibold text-white">
                      {catalogWallet.name || 'Unnamed Wallet'}
                    </h2>
                    <button
                      onClick={startEditingWallet}
                      className="text-gray-500 hover:text-blue-400 transition-colors"
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
              <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                <p className="font-medium">Error analyzing wallet</p>
                <p className="text-sm mt-1">{error.message}</p>
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
                <div className="mb-6 border-b border-gray-700">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab('positions')}
                      className={`pb-3 px-2 font-medium transition-colors ${
                        activeTab === 'positions'
                          ? 'text-white border-b-2 border-solana-green'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      Positions ({data?.positions.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('trades')}
                      className={`pb-3 px-2 font-medium transition-colors ${
                        activeTab === 'trades'
                          ? 'text-white border-b-2 border-solana-green'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      Trades ({data?.totalTrades || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('profile')}
                      className={`pb-3 px-2 font-medium transition-colors ${
                        activeTab === 'profile'
                          ? 'text-white border-b-2 border-solana-green'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
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
                <h2 className="text-2xl font-bold text-gray-300 mb-2">
                  Analyze Any Solana Wallet
                </h2>
                <p className="text-gray-500 max-w-md mx-auto">
                  Enter a wallet address above to see trading performance, PnL breakdown,
                  and detailed trade history. All calculations are done in SOL.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>- Built without motion -</p>
        </div>
      </footer>

      {/* Status Log - always visible */}
      <StatusLog maxMessages={100} />
    </div>
  );
}

export default App;
