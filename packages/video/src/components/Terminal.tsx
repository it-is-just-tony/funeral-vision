import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { THEME, FONT } from "../theme";
import { Typewriter, TerminalLine } from "./Typewriter";

// Terminal window chrome component
const TerminalWindow: React.FC<{
  children: React.ReactNode;
  title?: string;
}> = ({ children, title = "Terminal" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fast window entrance
  const windowProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const windowScale = interpolate(windowProgress, [0, 1], [0.85, 1]);
  const windowOpacity = interpolate(windowProgress, [0, 1], [0, 1]);

  // 3D rotation - X rotation entrance only (Y handled globally)
  const rotateX = interpolate(windowProgress, [0, 1], [15, 0]);

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
          width: "92%",
          maxWidth: 1100,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: `
            0 50px 100px -20px rgba(0, 0, 0, 0.5),
            0 30px 60px -30px rgba(0, 0, 0, 0.6),
            0 0 0 1px ${THEME.border},
            0 0 60px -20px ${THEME.pink}30
          `,
          transform: `
            scale(${windowScale})
            rotateX(${rotateX + subtleRotateX}deg)
          `,
          transformStyle: "preserve-3d",
          opacity: windowOpacity,
          background: THEME.terminalBg,
        }}
      >
      {/* Title Bar */}
      <div
        style={{
          background: `linear-gradient(180deg, #1a1b26 0%, ${THEME.terminalBg} 100%)`,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${THEME.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f56" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27c93f" }} />
        </div>
        <span style={{ color: THEME.terminalGray, fontSize: 12, marginLeft: 8, fontFamily: FONT.mono }}>
          {title}
        </span>
      </div>

      {/* Terminal Content */}
      <div
        style={{
          padding: "24px 28px",
          minHeight: 680,
          fontFamily: FONT.mono,
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {children}
      </div>
      </div>
    </div>
  );
};

// Condensed terminal content - just the essentials
const TerminalContent: React.FC = () => {
  const lines: TerminalLine[] = [
    { text: "git clone https://github.com/it-is-just-tony/funeral-vision && cd funeral-vision", isCommand: true },
    { text: "Cloning... done.", color: THEME.terminalGreen, instant: true },
    { text: "", instant: true },
    { text: "pnpm install", isCommand: true },
    { text: "Installing dependencies...", color: THEME.terminalGray, instant: true },
    { text: "Done in 4.2s", color: THEME.terminalGreen, instant: true },
    { text: "", instant: true },
    { text: "pnpm dev", isCommand: true },
    { text: "[api] localhost:3001", color: THEME.terminalPurple, instant: true },
    { text: "[web] localhost:5173", color: THEME.terminalPurple, instant: true },
    { text: "Ready!", color: THEME.terminalGreen, instant: true },
  ];

  return <Typewriter lines={lines} charFrames={0.8} lineDelay={6} startFrame={8} />;
};

export const TerminalSetup: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TerminalWindow title="~/funeral-vision — zsh">
        <TerminalContent />
      </TerminalWindow>
    </AbsoluteFill>
  );
};
