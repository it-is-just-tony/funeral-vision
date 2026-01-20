import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { walletRouter } from './routes/wallet.js';
import { initDatabase, backfillBehaviorStats } from './db/index.js';
import { buildWalletProfile } from './services/profile.js';

// Load .env from repo root (works regardless of cwd)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.join(repoRoot, '.env') });

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
  console.log(`⚰️ Funeral Vision API running on http://localhost:${PORT}`);
});
