# Solana PnL Tracker

A powerful, self-hosted application for tracking profit and loss on Solana wallet trades. Analyze any wallet's trading performance, identify profitable patterns, and simulate what it would be like to copy-trade specific wallets.

---

## Features

| Feature | Description |
|---------|-------------|
| **PnL Tracking** | Accurate profit/loss calculation using FIFO cost basis |
| **Multi-Wallet Support** | Import and track unlimited wallets |
| **Follow Simulation** | Calculate realistic returns if you copied a wallet's trades |
| **Copytrade Detection** | Identify wallets that farm copytraders with quick dumps |
| **Real-time Sync** | Incremental transaction syncing via Helius API |
| **Offline Analysis** | All data cached locally - analyze without API calls |

---

## Screenshots

```
┌─────────────────────────────────────────────────────────────────┐
│  Simulated Follows                        [Calculate Scores]    │
├─────────────────────────────────────────────────────────────────┤
│  Wallet      Sim.PnL  Actual PnL  Follow Score  Win Rate  Exit  │
│  ────────────────────────────────────────────────────────────── │
│  Trader1     +42.5    +51.2       83%           72%       4.2m  │
│  Whale99     +38.1    +89.4       43%           68%       45s   │
│  Degen.sol   +12.3    +15.8       78%           81%       8.1m  │
└─────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Express    │────▶│   Helius     │
│   React +    │◀────│   API        │◀────│   API        │
│   Vite       │     │   Server     │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   SQLite     │
                    │   Database   │
                    └──────────────┘
```

### Data Flow

1. **Transaction Fetching** - Pulls enhanced transaction data from Helius API
2. **Swap Parsing** - Identifies DEX swaps (Jupiter, Raydium, Orca, Pump.fun, etc.)
3. **Trade Normalization** - Converts swaps to standardized buy/sell records
4. **PnL Calculation** - Uses FIFO cost basis to compute realized gains/losses
5. **Follow Simulation** - Models copy-trading with realistic delay and slippage

### Follow Score Explained

The **Follow Score** measures how profitable it would be to copy a wallet's trades:

```
Follow Score = Simulated PnL / Actual PnL
```

**Simulation Parameters:**
- **Entry Delay**: 5 seconds after the original trade
- **Slippage Model**: Size-based (1-10% depending on trade size)
- **Price Drift**: ~0.1% per second of delay

**Score Interpretation:**

| Score | Rating | Meaning |
|-------|--------|---------|
| 80-100% | Excellent | Capture most of their profits |
| 50-80% | Good | Followable with moderate loss |
| 20-50% | Risky | Significant timing/slippage loss |
| < 20% | Unfollowable | Likely farming copytraders |

**Red Flags:**
- High "Quick Dump Rate" (>30% of tokens sold within 60s)
- Low follow score + high actual PnL = copytrade farmer

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, TailwindCSS, React Query |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | SQLite with WAL mode (better-sqlite3) |
| **API** | Helius Enhanced Transactions API |

### Project Structure

```
sol/
├── packages/
│   ├── api/                 # Express backend
│   │   ├── src/
│   │   │   ├── index.ts           # Server entry point
│   │   │   ├── routes/
│   │   │   │   └── wallet.ts      # REST + SSE endpoints
│   │   │   ├── services/
│   │   │   │   ├── helius.ts      # Helius API client
│   │   │   │   ├── parser.ts      # Transaction parser
│   │   │   │   ├── pnl.ts         # PnL calculator
│   │   │   │   ├── profile.ts     # Wallet behavior analysis
│   │   │   │   ├── discovery.ts   # Wallet ranking
│   │   │   │   └── followSimulator.ts  # Copy-trade simulation
│   │   │   └── db/
│   │   │       └── index.ts       # SQLite schema & queries
│   │   └── package.json
│   │
│   ├── web/                 # React frontend
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── api/               # API client
│   │   │   ├── components/        # React components
│   │   │   └── hooks/             # React Query hooks
│   │   └── package.json
│   │
│   └── shared/              # Shared TypeScript types
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── package.json             # Root workspace config
├── pnpm-workspace.yaml
└── .env                     # Environment variables
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm
- **Helius API Key** - [Get one free](https://dev.helius.xyz/)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/yourusername/solana-pnl-tracker.git
cd solana-pnl-tracker
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Configure environment**

```bash
# Copy example env file
cp .env.example .env

# Edit with your API key
nano .env
```

```env
# .env
HELIUS_API_KEY=your_helius_api_key_here
PORT=3001
WEB_PORT=3000
DATABASE_PATH=./data/pnl.db
```

**4. Start development servers**

```bash
# Run both API and web concurrently
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |

### Production Build

```bash
# Build all packages
pnpm build

# Start production server
pnpm start
```

---

## API Reference

### Wallet Analysis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/:address/analyze` | GET | Analyze wallet PnL |
| `/api/wallet/:address/trades` | GET | Get paginated trades |
| `/api/wallet/:address/positions` | GET | Get token positions |
| `/api/wallet/:address/profile` | GET | Get behavior profile |
| `/api/wallet/:address/status` | GET | Get sync status (SSE) |

### Wallet Catalog

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/catalog/list` | GET | List all tracked wallets |
| `/api/wallet/catalog/import` | POST | Import wallets from JSON |
| `/api/wallet/catalog/:address` | DELETE | Remove wallet |
| `/api/wallet/catalog/:address` | PATCH | Update wallet metadata |

### Follow Scoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/follow-score/calculate-all` | POST | Calculate scores for all wallets |
| `/api/wallet/:address/follow-score` | GET | Get cached follow score |
| `/api/wallet/discovery/profitable` | GET | Get ranked wallets |

### Query Parameters

**`/api/wallet/:address/analyze`**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `timeframe` | string | `all` | `24h`, `7d`, `30d`, `all` |
| `refresh` | boolean | `false` | Force re-sync from Helius |

**`/api/wallet/discovery/profitable`**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minTrades` | number | `1` | Minimum trade count |
| `minVolume` | number | `0` | Minimum SOL volume |
| `minWinRate` | number | `0` | Minimum win rate % |
| `limit` | number | `500` | Max results |

---

## Database Schema

```sql
-- Core tables
wallets              -- Tracked wallets with sync state & cached stats
transactions         -- Raw Helius transaction cache
trades               -- Parsed swap trades (buy/sell)
positions            -- Aggregated per-token positions
cost_basis_lots      -- FIFO lots for PnL calculation
token_metadata       -- Token symbol/name cache
wallet_follow_scores -- Simulated follow returns
```

**Key Cached Fields on `wallets`:**
- `total_realized_pnl` - Lifetime PnL
- `win_rate` - % of profitable token exits
- `total_sol_volume` - Total trading volume
- `quick_flip_rate` - % of quick flips (<5 min holds)
- `exited_token_rate` - % of positions fully closed

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HELIUS_API_KEY` | Yes | - | Your Helius API key |
| `PORT` | No | `3001` | API server port |
| `WEB_PORT` | No | `3000` | Web frontend port |
| `DATABASE_PATH` | No | `./data/pnl.db` | SQLite database path |

### Slippage Models

The follow simulator supports three slippage models:

| Model | Small (<0.5 SOL) | Medium (0.5-2 SOL) | Large (>2 SOL) |
|-------|------------------|---------------------|----------------|
| Conservative | 1% | 2% | 5% |
| Moderate | 2% | 5% | 10% |
| Aggressive | 3% | 8% | 15% |

---

## Development

### Available Scripts

```bash
pnpm dev          # Run API + web in parallel
pnpm dev:api      # Run API only
pnpm dev:web      # Run web only
pnpm build        # Build all packages
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript checks
```

### Adding a New Service

1. Create service file in `packages/api/src/services/`
2. Export functions from the service
3. Import and use in `routes/wallet.ts`
4. Add types to `packages/shared/src/index.ts`

---

## Troubleshooting

### Common Issues

**"HELIUS_API_KEY environment variable is required"**
- Ensure `.env` file exists in project root
- Check the key is correctly set (no quotes needed)

**Database locked errors**
- SQLite uses WAL mode - ensure only one write process
- Check no zombie Node processes: `pkill -f "node.*api"`

**Stale data after wallet sync**
- Click "Recalculate" on the Follow Scores panel
- Use `?refresh=true` query param on analyze endpoint

**Missing follow scores**
- Click "Calculate Scores" button in the UI
- Or POST to `/api/wallet/follow-score/calculate-all`

---

## License

MIT

---

## Acknowledgments

- [Helius](https://helius.xyz/) - Solana RPC and enhanced transaction API
- [Jupiter](https://jup.ag/) - DEX aggregator
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Fast SQLite bindings

