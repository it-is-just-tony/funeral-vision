import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { walletRouter } from './routes/wallet.js';
import { initDatabase, backfillBehaviorStats } from './db/index.js';
import { buildWalletProfile } from './services/profile.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDatabase();

// Backfill behavior stats for existing wallets (runs once if needed)
backfillBehaviorStats(buildWalletProfile);

// Routes
app.use('/api/wallet', walletRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Solana PnL API running on http://localhost:${PORT}`);
});
