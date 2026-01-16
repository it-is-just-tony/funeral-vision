import { useState, useEffect, type FormEvent } from 'react';

interface WalletInputProps {
  onSubmit: (address: string) => void;
  isLoading?: boolean;
  initialValue?: string;
}

export function WalletInput({ onSubmit, isLoading, initialValue = '' }: WalletInputProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  // Update value when initialValue changes
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();

    // Basic validation - Solana addresses are base58 and 32-44 chars
    if (trimmed.length < 32 || trimmed.length > 44) {
      setError('Please enter a valid Solana wallet address');
      return;
    }

    // Check for valid base58 characters
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
      setError('Invalid characters in address');
      return;
    }

    setError('');
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="Enter Solana wallet address..."
          className="w-full px-6 py-4 bg-gray-800 border border-gray-700 rounded-xl text-lg placeholder-gray-500 focus:outline-none focus:border-solana-purple focus:ring-1 focus:ring-solana-purple transition-colors"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-solana-purple to-solana-green rounded-lg font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing...
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
    </form>
  );
}
