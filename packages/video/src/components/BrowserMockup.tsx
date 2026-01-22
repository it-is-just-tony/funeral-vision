import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { THEME, FONT } from "../theme";

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

const BrowserChrome: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animation
  const progress = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const scale = interpolate(progress, [0, 1], [0.85, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  // 3D rotation - X rotation entrance only (Y handled globally)
  const rotateX = interpolate(progress, [0, 1], [15, 0]);

  // Subtle continuous X movement
  const subtleRotateX = Math.sin(frame * 0.02) * 1.5;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 1700,
          minHeight: 900,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: `
            0 50px 100px -20px rgba(0,0,0,0.5),
            0 30px 60px -30px rgba(0,0,0,0.6),
            0 0 0 1px ${THEME.border}
          `,
          transform: `
            scale(${scale})
            rotateX(${rotateX + subtleRotateX}deg)
          `,
          transformStyle: "preserve-3d",
          opacity,
          background: THEME.bgPrimary,
        }}
      >
        <div
          style={{
            background: THEME.bgSecondary,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${THEME.border}`,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <div
            style={{
              flex: 1,
              background: THEME.bgInput,
              borderRadius: 6,
              padding: "5px 10px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ color: THEME.green, fontSize: 9 }}>🔒</span>
            <span style={{ color: THEME.textMuted, fontSize: 11, fontFamily: FONT.mono }}>localhost:5173</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

const AppHeader: React.FC<{ activeView: number }> = ({ activeView }) => {
  const views = ["Catalog", "Simulation", "Single Wallet"];
  return (
    <div
      style={{
        borderBottom: `1px solid ${THEME.border}`,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: `${THEME.bgSecondary}cc`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Img src={staticFile("funeralvision.svg")} style={{ width: 44, height: 44 }} />
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            fontFamily: FONT.sans,
            background: `linear-gradient(90deg, ${THEME.pink}, ${THEME.pinkLight})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Funeral Vision
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 2, background: THEME.bgHover, borderRadius: 8, padding: 3 }}>
          {views.map((v, i) => (
            <div
              key={v}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                background: i === activeView ? THEME.pink : "transparent",
                color: i === activeView ? "white" : THEME.textSecondary,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: FONT.sans,
              }}
            >
              {v}
            </div>
          ))}
        </div>
        <div style={{ padding: "6px 10px", background: THEME.bgHover, borderRadius: 6, color: THEME.textSecondary, fontSize: 11 }}>
          I am a psycho
        </div>
        <span style={{ color: THEME.textMuted, fontSize: 11 }}>v1.0.0</span>
      </div>
    </div>
  );
};

const AnimatedRow: React.FC<{ delay: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 25, stiffness: 200 } });
  const x = interpolate(progress, [0, 1], [25, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  return <div style={{ transform: `translateX(${x}px)`, opacity, ...style }}>{children}</div>;
};

const Button: React.FC<{ children: React.ReactNode; primary?: boolean; style?: React.CSSProperties }> = ({ children, primary, style }) => (
  <div
    style={{
      padding: "6px 12px",
      borderRadius: 6,
      background: primary ? `linear-gradient(90deg, ${THEME.pink}, ${THEME.pinkLight})` : THEME.bgHover,
      color: primary ? "white" : THEME.textPrimary,
      fontSize: 12,
      fontWeight: 500,
      fontFamily: FONT.sans,
      ...style,
    }}
  >
    {children}
  </div>
);

// ============================================================================
// CATALOG VIEW - Wallet list with checkboxes
// ============================================================================

const CatalogView: React.FC = () => {
  const wallets = [
    { emoji: "🐋", name: "Whale Alpha", address: "7xKXp9...mPq4", pnl: "+847.32", winRate: "78.4", txns: "1,247", lastSync: "Jan 21" },
    { emoji: "🦈", name: "Shark Trader", address: "4vBnkL...2xRt", pnl: "+324.18", winRate: "65.2", txns: "2,891", lastSync: "Jan 21" },
    { emoji: "🎯", name: "Sniper Bot", address: "9pTrmN...8vQw", pnl: "+156.90", winRate: "82.1", txns: "456", lastSync: "Jan 20" },
    { emoji: "💀", name: "Degen Larry", address: "2qWexZ...4pLm", pnl: "-67.45", winRate: "34.8", txns: "5,123", lastSync: "Jan 21" },
    { emoji: "🔥", name: "Hot Wallet", address: "8kLmvR...3jNp", pnl: "+89.21", winRate: "71.3", txns: "892", lastSync: "Jan 19" },
  ];

  return (
    <div style={{ padding: 20 }}>
      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Button primary>Import Wallets</Button>
          <Button>Export</Button>
          <Button>Copy</Button>
          <Button>🗑️ Delete Selected</Button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: THEME.textSecondary, fontSize: 12 }}>3 of 47 selected</span>
          <div style={{ padding: "5px 10px", background: THEME.bgInput, border: `1px solid ${THEME.borderInput}`, borderRadius: 6, color: THEME.textPrimary, fontSize: 12 }}>
            All Time ▾
          </div>
          <Button>🔄 Refresh</Button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: THEME.bgCard, borderRadius: 10, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40px 2fr 1fr 1fr 1fr 1.2fr 60px",
            padding: "10px 16px",
            background: `${THEME.bgSecondary}80`,
            borderBottom: `1px solid ${THEME.border}`,
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 14, height: 14, border: `2px solid ${THEME.pink}`, borderRadius: 3, background: THEME.pink }} />
          </div>
          {["Wallet", "PnL", "Win Rate", "Transactions", "Sync Info", ""].map((h, i) => (
            <div key={h} style={{ color: THEME.textSecondary, fontSize: 11, fontWeight: 600, fontFamily: FONT.sans, textAlign: i > 0 && i < 5 ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {wallets.map((w, i) => (
          <AnimatedRow key={i} delay={8 + i * 3}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 2fr 1fr 1fr 1fr 1.2fr 60px",
                padding: "14px 16px",
                borderBottom: `1px solid ${THEME.border}`,
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 14, height: 14, border: `2px solid ${i < 3 ? THEME.pink : THEME.borderInput}`, borderRadius: 3, background: i < 3 ? THEME.pink : "transparent" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{w.emoji}</span>
                <div>
                  <div style={{ color: THEME.textPrimary, fontWeight: 500, fontSize: 13, fontFamily: FONT.sans }}>{w.name}</div>
                  <div style={{ color: THEME.textMuted, fontSize: 10, fontFamily: FONT.mono }}>{w.address}</div>
                </div>
              </div>
              <div style={{ color: parseFloat(w.pnl) >= 0 ? THEME.green : THEME.red, fontWeight: 600, fontSize: 13, textAlign: "right" }}>
                {parseFloat(w.pnl) >= 0 ? "+" : ""}{w.pnl} SOL
              </div>
              <div style={{ color: parseFloat(w.winRate) >= 50 ? THEME.green : THEME.red, fontSize: 13, textAlign: "right" }}>{w.winRate}%</div>
              <div style={{ color: THEME.textSecondary, fontSize: 13, textAlign: "right" }}>{w.txns}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: THEME.textSecondary, fontSize: 11 }}>Last: {w.lastSync}</div>
                <div style={{ color: THEME.textMuted, fontSize: 10 }}>First: Dec 15</div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <span style={{ cursor: "pointer" }}>✏️</span>
                <span style={{ cursor: "pointer" }}>🗑️</span>
              </div>
            </div>
          </AnimatedRow>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SIMULATION VIEW - Follow simulation with scores
// ============================================================================

const SimulationView: React.FC = () => {
  const wallets = [
    { emoji: "🐋", name: "Whale Alpha", address: "7xKX...9mPq", simPnl: "+234.56", actualPnl: "+847.32", followScore: "85", winRate: "78.4", avgExit: "2.4h", quickDump: "8" },
    { emoji: "🎯", name: "Sniper Bot", address: "9pTr...mN8v", simPnl: "+142.30", actualPnl: "+156.90", followScore: "91", winRate: "82.1", avgExit: "45m", quickDump: "3" },
    { emoji: "🦈", name: "Shark Trader", address: "4vBn...kL2x", simPnl: "+89.12", actualPnl: "+324.18", followScore: "27", winRate: "65.2", avgExit: "12m", quickDump: "42", isRisky: true },
    { emoji: "🔥", name: "Hot Wallet", address: "8kLm...vR3j", simPnl: "+67.89", actualPnl: "+89.21", followScore: "76", winRate: "71.3", avgExit: "1.8h", quickDump: "11" },
    { emoji: "💀", name: "Degen Larry", address: "2qWe...xZ4p", simPnl: "-89.23", actualPnl: "-67.45", followScore: "12", winRate: "34.8", avgExit: "3m", quickDump: "67", isRisky: true },
  ];

  const getScoreColor = (score: string) => {
    const s = parseInt(score);
    if (s >= 80) return THEME.green;
    if (s >= 50) return "#eab308";
    if (s >= 20) return "#f97316";
    return THEME.red;
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ color: THEME.textPrimary, fontSize: 18, fontWeight: 600, fontFamily: FONT.sans, margin: 0 }}>Follow Simulation</h2>
          <p style={{ color: THEME.textSecondary, fontSize: 12, marginTop: 4, fontFamily: FONT.sans }}>
            Simulate following wallets with realistic delays and slippage. <span style={{ color: THEME.pink, textDecoration: "underline" }}>How is this calculated?</span>
          </p>
        </div>
        <Button primary>Calculate Scores</Button>
      </div>

      {/* Table */}
      <div style={{ background: THEME.bgCard, borderRadius: 10, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
            padding: "10px 16px",
            background: `${THEME.bgSecondary}80`,
            borderBottom: `1px solid ${THEME.border}`,
          }}
        >
          {["Wallet", "Sim. PnL ↓", "Actual PnL", "Follow Score", "Win Rate", "Avg Exit", "Quick Dump"].map((h, i) => (
            <div key={h} style={{ color: THEME.textSecondary, fontSize: 11, fontWeight: 600, fontFamily: FONT.sans, textAlign: i > 0 ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {wallets.map((w, i) => (
          <AnimatedRow key={i} delay={8 + i * 3}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
                padding: "14px 16px",
                borderBottom: `1px solid ${THEME.border}`,
                alignItems: "center",
                opacity: w.isRisky ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{w.emoji}</span>
                <div>
                  <div style={{ color: THEME.textPrimary, fontWeight: 500, fontSize: 13, fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: 6 }}>
                    {w.name}
                    {w.isRisky && <span style={{ fontSize: 9, padding: "2px 5px", background: "rgba(239,68,68,0.2)", color: THEME.red, borderRadius: 3 }}>⚠️</span>}
                  </div>
                  <div style={{ color: THEME.textMuted, fontSize: 10, fontFamily: FONT.mono }}>{w.address}</div>
                </div>
              </div>
              <div style={{ color: parseFloat(w.simPnl) >= 0 ? THEME.green : THEME.red, fontWeight: 600, fontSize: 13, textAlign: "right" }}>{w.simPnl}</div>
              <div style={{ color: THEME.textSecondary, fontSize: 13, textAlign: "right" }}>{w.actualPnl}</div>
              <div style={{ color: getScoreColor(w.followScore), fontWeight: 600, fontSize: 13, textAlign: "right" }}>{w.followScore}%</div>
              <div style={{ color: parseFloat(w.winRate) >= 50 ? THEME.green : THEME.red, fontSize: 13, textAlign: "right" }}>{w.winRate}%</div>
              <div style={{ color: THEME.textSecondary, fontSize: 13, textAlign: "right" }}>{w.avgExit}</div>
              <div style={{ color: parseInt(w.quickDump) > 30 ? THEME.red : THEME.textSecondary, fontSize: 13, textAlign: "right" }}>{w.quickDump}%</div>
            </div>
          </AnimatedRow>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SINGLE WALLET VIEW - Detailed wallet analysis
// ============================================================================

const SingleWalletView: React.FC = () => {
  const stats = [
    { label: "Total PnL", value: "+847.32 SOL", color: THEME.green, sub: null },
    { label: "Win Rate", value: "78.4%", color: THEME.green, sub: "156W / 43L" },
    { label: "Total Trades", value: "199", color: THEME.textPrimary, sub: "156 buys / 43 sells" },
    { label: "Volume", value: "2,847 SOL", color: THEME.textPrimary, sub: "Avg: 14.3 SOL" },
    { label: "Avg Hold Time", value: "2.4h", color: THEME.textPrimary, sub: null },
    { label: "Tokens Traded", value: "47", color: THEME.textPrimary, sub: null },
  ];

  const positions = [
    { token: "BONK", mint: "DezX...yBcL", pnl: "+245.67", bought: "2.5B", sold: "2.5B", remaining: "0", cost: "123.45", proceeds: "369.12", trades: "12", winRate: "83" },
    { token: "WIF", mint: "EKpQ...8nMv", pnl: "+189.34", bought: "45,000", sold: "45,000", remaining: "0", cost: "89.23", proceeds: "278.57", trades: "8", winRate: "75" },
    { token: "POPCAT", mint: "7sLe...pQwR", pnl: "+156.78", bought: "1.2M", sold: "800K", remaining: "400K", cost: "67.89", proceeds: "224.67", trades: "6", winRate: "100" },
    { token: "MYRO", mint: "HN7c...xT4k", pnl: "-34.56", bought: "500K", sold: "500K", remaining: "0", cost: "78.90", proceeds: "44.34", trades: "4", winRate: "25" },
  ];

  return (
    <div style={{ padding: 20 }}>
      {/* Back button */}
      <div style={{ color: THEME.textSecondary, fontSize: 12, marginBottom: 12, fontFamily: FONT.sans }}>← Back to Catalog</div>

      {/* Wallet input */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            background: THEME.bgInput,
            border: `1px solid ${THEME.borderInput}`,
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: THEME.textMuted, fontSize: 13 }}>🔍</span>
          <span style={{ color: THEME.textPrimary, fontSize: 13, fontFamily: FONT.mono }}>7xKXp9mPq4vBnkL2xRt9pTrmN8vQw2qWexZ4pLm8kLmvR3j</span>
        </div>
      </div>

      {/* Wallet header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 32 }}>🐋</span>
        <div>
          <div style={{ color: THEME.textPrimary, fontSize: 20, fontWeight: 600, fontFamily: FONT.sans }}>Whale Alpha</div>
        </div>
        <span style={{ color: THEME.textMuted, cursor: "pointer" }}>✏️</span>
      </div>

      {/* Timeframe + Refresh */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["24h", "7d", "30d", "90d", "All"].map((t, i) => (
            <div
              key={t}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: i === 4 ? THEME.pink : THEME.bgHover,
                color: i === 4 ? "white" : THEME.textSecondary,
                fontSize: 12,
                fontFamily: FONT.sans,
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div style={{ padding: "6px 14px", background: `${THEME.pink}33`, border: `1px solid ${THEME.pink}80`, borderRadius: 8, color: THEME.textPrimary, fontSize: 12 }}>
          Refresh
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <AnimatedRow key={i} delay={5 + i * 2} style={{ background: THEME.bgCard, borderRadius: 10, padding: "14px 16px", border: `1px solid ${THEME.border}` }}>
            <div style={{ color: THEME.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: FONT.sans }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 18, fontWeight: 700, fontFamily: FONT.sans }}>{s.value}</div>
            {s.sub && <div style={{ color: THEME.textMuted, fontSize: 10, marginTop: 2 }}>{s.sub}</div>}
          </AnimatedRow>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 20, borderBottom: `1px solid ${THEME.border}`, marginBottom: 16 }}>
        {[`Positions (${positions.length})`, "Trades (199)", "Profile"].map((tab, i) => (
          <div
            key={tab}
            style={{
              color: i === 0 ? THEME.textPrimary : THEME.textSecondary,
              fontSize: 13,
              fontWeight: 500,
              paddingBottom: 10,
              borderBottom: i === 0 ? `2px solid ${THEME.pinkLight}` : "none",
              fontFamily: FONT.sans,
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div style={{ background: THEME.bgCard, borderRadius: 10, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr",
            padding: "10px 14px",
            background: `${THEME.bgSecondary}80`,
            borderBottom: `1px solid ${THEME.border}`,
          }}
        >
          {["Token", "Realized PnL", "Total Bought", "Total Sold", "Remaining", "Cost Basis", "Proceeds", "Trades", "Win Rate"].map((h, i) => (
            <div key={h} style={{ color: THEME.textSecondary, fontSize: 10, fontWeight: 600, fontFamily: FONT.sans, textAlign: i > 0 ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {positions.map((p, i) => (
          <AnimatedRow key={i} delay={18 + i * 3}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr",
                padding: "12px 14px",
                borderBottom: `1px solid ${THEME.border}`,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ color: THEME.pink, fontWeight: 500, fontSize: 12, fontFamily: FONT.sans }}>{p.token}</div>
                <div style={{ color: THEME.textMuted, fontSize: 9, fontFamily: FONT.mono }}>{p.mint}</div>
              </div>
              <div style={{ color: parseFloat(p.pnl) >= 0 ? THEME.green : THEME.red, fontWeight: 600, fontSize: 12, textAlign: "right" }}>{p.pnl} SOL</div>
              <div style={{ color: THEME.textSecondary, fontSize: 11, textAlign: "right" }}>{p.bought}</div>
              <div style={{ color: THEME.textSecondary, fontSize: 11, textAlign: "right" }}>{p.sold}</div>
              <div style={{ color: THEME.textSecondary, fontSize: 11, textAlign: "right" }}>{p.remaining}</div>
              <div style={{ color: THEME.textMuted, fontSize: 11, textAlign: "right" }}>{p.cost} SOL</div>
              <div style={{ color: THEME.textMuted, fontSize: 11, textAlign: "right" }}>{p.proceeds} SOL</div>
              <div style={{ color: THEME.textSecondary, fontSize: 11, textAlign: "center" }}>{p.trades}</div>
              <div style={{ color: parseInt(p.winRate) >= 50 ? THEME.green : THEME.red, fontSize: 11, textAlign: "center" }}>{p.winRate}%</div>
            </div>
          </AnimatedRow>
        ))}

        {/* Summary footer */}
        <div style={{ padding: "12px 14px", background: `${THEME.bgHover}50`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: THEME.textSecondary, fontSize: 12 }}>Total Realized PnL:</span>
          <span style={{ color: THEME.green, fontSize: 15, fontWeight: 700 }}>+557.23 SOL</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export const CatalogScene: React.FC = () => (
  <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <BrowserChrome>
      <AppHeader activeView={0} />
      <CatalogView />
    </BrowserChrome>
  </AbsoluteFill>
);

export const SimulationScene: React.FC = () => (
  <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <BrowserChrome>
      <AppHeader activeView={1} />
      <SimulationView />
    </BrowserChrome>
  </AbsoluteFill>
);

export const SingleWalletScene: React.FC = () => (
  <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <BrowserChrome>
      <AppHeader activeView={2} />
      <SingleWalletView />
    </BrowserChrome>
  </AbsoluteFill>
);

export const BrowserMockup = CatalogScene;
