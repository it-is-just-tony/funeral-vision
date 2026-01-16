import { useState, useEffect, useCallback } from 'react';
import type { CatalogWallet, Timeframe, AggregatedStats } from '@funeral-vision/shared';
import {
  getCatalogWallets,
  importWallets,
  deleteWallet,
  refreshSelectedWallets,
  updateWalletMetadata,
  calculateFollowScores,
} from '../api';
import { useProfitableWallets } from '../hooks/useProfitableWallets';
import { ProfitableWallets } from './ProfitableWallets';

interface WalletCatalogProps {
  onSelectWallet: (address: string) => void;
}

const STORAGE_KEY = 'funeral-vision-selected-wallets';

function formatSOL(value: number | undefined | null): string {
  if (value === undefined || value === null) return '-';
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return 'Never';
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function WalletCatalog({ onSelectWallet }: WalletCatalogProps) {
  const [wallets, setWallets] = useState<CatalogWallet[]>([]);
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(() => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [aggregatedStats, setAggregatedStats] = useState<AggregatedStats | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmoji, setEditingEmoji] = useState('');
  const [isCalculatingScores, setIsCalculatingScores] = useState(false);
  const { data: profitableWallets = [], isLoading: isLoadingProfitable, refetch: refetchProfitable } = useProfitableWallets({
    timeframe: '30d',
    minTrades: 1,
    minVolume: 0,
    minWinRate: 0,
    limit: 500,
  });

  // Persist selection to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedAddresses]));
  }, [selectedAddresses]);

  const loadCatalog = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getCatalogWallets();
      setWallets(data);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleCalculateScores = useCallback(async () => {
    try {
      setIsCalculatingScores(true);
      await calculateFollowScores({ delaySeconds: 5, slippageModel: 'moderate' });
      // Refresh the profitable wallets list to show updated scores
      await refetchProfitable();
    } catch (err) {
      console.error('Failed to calculate follow scores:', err);
    } finally {
      setIsCalculatingScores(false);
    }
  }, [refetchProfitable]);

  const handleImport = async () => {
    setImportError('');
    try {
      const parsed = JSON.parse(importJson);
      const walletsToImport = Array.isArray(parsed) ? parsed : [parsed];
      
      setIsImporting(true);
      const result = await importWallets(walletsToImport);
      
      if (result.failed > 0) {
        setImportError(`Imported ${result.imported}, failed ${result.failed}: ${result.failedDetails.map(f => f.error).join(', ')}`);
      } else {
        setShowImportModal(false);
        setImportJson('');
      }
      
      await loadCatalog();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid JSON');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImportJson(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleDelete = async (address: string) => {
    if (!confirm('Remove this wallet from the catalog?')) return;
    
    try {
      await deleteWallet(address);
      setSelectedAddresses(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
      await loadCatalog();
    } catch (err) {
      console.error('Failed to delete wallet:', err);
    }
  };

  const startEditing = (wallet: CatalogWallet) => {
    setEditingAddress(wallet.address);
    setEditingName(wallet.name || '');
    setEditingEmoji(wallet.emoji || '👛');
  };

  const cancelEditing = () => {
    setEditingAddress(null);
    setEditingName('');
    setEditingEmoji('');
  };

  const saveEditing = async () => {
    if (!editingAddress) return;
    try {
      await updateWalletMetadata(editingAddress, {
        name: editingName.trim() || undefined,
        emoji: editingEmoji.trim() || undefined,
      });
      await loadCatalog();
      cancelEditing();
    } catch (err) {
      console.error('Failed to update wallet metadata:', err);
    }
  };

  const handleExportWallets = () => {
    const exportData = wallets.map(w => ({
      trackedWalletAddress: w.address,
      name: w.name || '',
      emoji: w.emoji || '👛',
      alertsOn: w.alertsOn ?? false,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'funeral-vision-wallets.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleSelection = (address: string) => {
    setSelectedAddresses(prev => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedAddresses(new Set(wallets.map(w => w.address)));
  };

  const selectNone = () => {
    setSelectedAddresses(new Set());
  };

  const handleRefreshSelected = async (e: React.MouseEvent) => {
    if (selectedAddresses.size === 0) return;
    
    // Hold Shift for full refresh (re-fetch all transactions)
    const forceRefresh = e.shiftKey;
    
    setIsRefreshing(true);
    setRefreshProgress({ current: 0, total: selectedAddresses.size });
    
    try {
      const result = await refreshSelectedWallets([...selectedAddresses], 'default', forceRefresh);
      setRefreshProgress(null);
      await loadCatalog();
      alert(`${forceRefresh ? 'Full refresh' : 'Refreshed'} ${result.successful}/${result.total} wallets`);
    } catch (err) {
      console.error('Failed to refresh wallets:', err);
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedAddresses.size === 0) return;
    if (!confirm(`Remove ${selectedAddresses.size} wallets from the catalog?`)) return;

    try {
      for (const address of selectedAddresses) {
        await deleteWallet(address);
      }
      setSelectedAddresses(new Set());
      await loadCatalog();
    } catch (err) {
      console.error('Failed to delete selected wallets:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfitableWallets
        wallets={profitableWallets}
        isLoading={isLoadingProfitable}
        onSelect={onSelectWallet}
        onCalculateScores={handleCalculateScores}
        isCalculating={isCalculatingScores}
      />

      {/* Header Actions */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-primary"
          >
            Import Wallets
          </button>
          <button
            onClick={handleExportWallets}
            className="btn-secondary"
            disabled={wallets.length === 0}
          >
            Export Wallets
          </button>
          <button
            onClick={selectAll}
            className="btn-secondary"
            disabled={wallets.length === 0}
          >
            Select All
          </button>
          <button
            onClick={selectNone}
            className="btn-secondary"
            disabled={selectedAddresses.size === 0}
          >
            Clear Selection
          </button>
          <button
            onClick={handleDeleteSelected}
            className="btn-secondary"
            disabled={selectedAddresses.size === 0}
            title="Remove selected wallets from catalog"
          >
            🗑️ Delete Selected
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-400">
            {selectedAddresses.size} of {wallets.length} selected
          </span>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={handleRefreshSelected}
            className="btn-secondary"
            disabled={selectedAddresses.size === 0 || isRefreshing}
            title="Fetch new transactions. Hold Shift for full re-sync."
          >
            {isRefreshing ? (
              refreshProgress 
                ? `🔄 ${refreshProgress.current}/${refreshProgress.total}` 
                : '🔄 Refreshing...'
            ) : (
              '🔄 Refresh'
            )}
          </button>
          {/* 
            <button
              onClick={handleAnalyzeSelected}
              className="btn-primary"
              disabled={selectedAddresses.size === 0 || isAnalyzing}
            >
              {isAnalyzing ? '📊 Analyzing...' : '📊 Analyze Selected'}
            </button>
          */}
        </div>
      </div>

      {/* Aggregated Stats */}
      {aggregatedStats && (
        <div className="card bg-gradient-to-r from-gray-800 to-gray-900">
          <h3 className="text-lg font-semibold mb-4">
            📊 Aggregated Stats ({aggregatedStats.totalWallets} wallets)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div>
              <div className="text-xs text-gray-400 uppercase">Total PnL</div>
              <div className={`text-xl font-bold ${aggregatedStats.totalRealizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                {aggregatedStats.totalRealizedPnL >= 0 ? '+' : ''}{formatSOL(aggregatedStats.totalRealizedPnL)} SOL
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase">Total Trades</div>
              <div className="text-xl font-bold">{aggregatedStats.totalTrades.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase">Win Rate</div>
              <div className={`text-xl font-bold ${aggregatedStats.overallWinRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                {aggregatedStats.overallWinRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase">Volume</div>
              <div className="text-xl font-bold">{formatSOL(aggregatedStats.totalSolVolume)} SOL</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase">Buys</div>
              <div className="text-xl font-bold text-blue-400">{aggregatedStats.totalBuys.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase">Sells</div>
              <div className="text-xl font-bold text-purple-400">{aggregatedStats.totalSells.toLocaleString()}</div>
            </div>
          </div>

          {/* Wallet Breakdown */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-400 mb-3">Breakdown by Wallet</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {aggregatedStats.walletBreakdown.map((wb) => (
                <div 
                  key={wb.address}
                  className="flex items-center justify-between p-2 bg-gray-800/50 rounded hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => onSelectWallet(wb.address)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{wb.emoji}</span>
                    <span className="font-medium">{wb.name}</span>
                    <span className="text-xs text-gray-500">{truncateAddress(wb.address)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">{wb.trades} trades</span>
                    <span className={`text-sm ${wb.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {wb.winRate.toFixed(0)}% WR
                    </span>
                    <span className={`font-medium ${wb.realizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                      {wb.realizedPnL >= 0 ? '+' : ''}{formatSOL(wb.realizedPnL)} SOL
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={() => setAggregatedStats(null)}
            className="mt-4 text-sm text-gray-400 hover:text-white"
          >
            ✕ Close stats
          </button>
        </div>
      )}

      {/* Wallet List */}
      {wallets.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-xl font-semibold mb-2">No wallets in catalog</h3>
          <p className="text-gray-400 mb-4">Import wallets to start tracking their PnL</p>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-primary"
          >
            Import Wallets
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="w-12 p-4">
                  <input
                    type="checkbox"
                    checked={selectedAddresses.size === wallets.length && wallets.length > 0}
                    onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                    className="w-4 h-4 rounded"
                  />
                </th>
                <th className="text-left p-4 text-gray-400 font-medium">Wallet</th>
                <th className="text-right p-4 text-gray-400 font-medium">PnL</th>
                <th className="text-right p-4 text-gray-400 font-medium">Win Rate</th>
                <th className="text-right p-4 text-gray-400 font-medium">Transactions</th>
                <th className="text-right p-4 text-gray-400 font-medium">Sync Info</th>
                <th className="w-24 p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {wallets.map((wallet) => (
                <tr 
                  key={wallet.address} 
                  className={`hover:bg-gray-800/30 transition-colors ${selectedAddresses.has(wallet.address) ? 'bg-gray-800/20' : ''}`}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedAddresses.has(wallet.address)}
                      onChange={() => toggleSelection(wallet.address)}
                      className="w-4 h-4 rounded"
                    />
                  </td>
                  <td className="p-4">
                    {editingAddress === wallet.address ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingEmoji}
                          onChange={(e) => setEditingEmoji(e.target.value)}
                          className="w-12 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center"
                          maxLength={2}
                        />
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-48 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                          placeholder="Wallet name"
                        />
                        <button
                          onClick={saveEditing}
                          className="text-green-400 hover:text-green-300 text-sm"
                          title="Save"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="text-gray-400 hover:text-gray-200 text-sm"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onSelectWallet(wallet.address)}
                        className="flex items-center gap-2 hover:text-solana-green transition-colors"
                      >
                        <span className="text-xl">{wallet.emoji}</span>
                        <div className="text-left">
                          <div className="font-medium">{wallet.name || 'Unnamed'}</div>
                          <div className="text-xs text-gray-500 font-mono">{truncateAddress(wallet.address)}</div>
                        </div>
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {wallet.totalRealizedPnL !== undefined && wallet.totalRealizedPnL !== null ? (
                      <span className={`font-medium ${wallet.totalRealizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                        {wallet.totalRealizedPnL >= 0 ? '+' : ''}{formatSOL(wallet.totalRealizedPnL)} SOL
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {wallet.winRate !== undefined && wallet.winRate !== null ? (
                      <span className={wallet.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                        {wallet.winRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right text-gray-300">
                    {wallet.totalTransactions.toLocaleString()}
                  </td>
                  <td className="p-4 text-right text-gray-400 text-sm">
                    <div>Last: {formatDate(wallet.lastSyncedAt)}</div>
                    <div className="text-xs text-gray-500">First: {formatDate(wallet.firstSyncedAt)}</div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEditing(wallet)}
                        className="text-gray-500 hover:text-blue-400 transition-colors"
                        title="Edit name/emoji"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(wallet.address)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title="Remove from catalog"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Import Wallets</h2>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Upload JSON file or paste JSON below. Supports export format of most trading terminals.
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-gray-700 file:text-white hover:file:bg-gray-600"
              />
            </div>

            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`[
  {
    "trackedWalletAddress": "...",
    "name": "Wallet Name",
    "emoji": "👛",
    "alertsOn": true
  }
]`}
              className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-sm mb-4"
            />

            {importError && (
              <div className="text-red-400 text-sm mb-4 p-3 bg-red-900/30 rounded">
                {importError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportJson('');
                  setImportError('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="btn-primary"
                disabled={!importJson.trim() || isImporting}
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
