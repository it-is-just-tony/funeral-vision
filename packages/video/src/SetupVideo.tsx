import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, Sequence } from "remotion";
import { Intro } from "./components/Intro";
import { TerminalSetup } from "./components/Terminal";
import { CatalogScene, SimulationScene, SingleWalletScene } from "./components/BrowserMockup";

// Theme colors for background
const THEME = {
  bgPrimary: "#0D1117",
  pink: "#e96089",
  pinkLight: "#e189a4",
};

// Global background that's always visible
const GlobalBackground: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle animated gradient movement
  const gradientX = 50 + Math.sin(frame * 0.008) * 10;
  const gradientY = 40 + Math.cos(frame * 0.006) * 10;

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(ellipse at ${gradientX}% ${gradientY}%, ${THEME.pink}15 0%, transparent 50%),
          radial-gradient(ellipse at ${100 - gradientX}% ${100 - gradientY}%, ${THEME.pinkLight}10 0%, transparent 40%),
          linear-gradient(180deg, #0a0a0f 0%, ${THEME.bgPrimary} 50%, #0a0a0f 100%)
        `,
      }}
    />
  );
};

// Global rotation wrapper - rotates Y from 20 to -20 over total composition
const GlobalRotation: React.FC<{ children: React.ReactNode; startFrame: number }> = ({ children, startFrame }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Calculate global frame position
  const globalFrame = startFrame + frame;

  // Base Y rotation from 20 to -20 with easing for smoother feel
  const baseRotateY = interpolate(
    globalFrame,
    [0, durationInFrames],
    [20, -20],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) }
  );

  // Add subtle organic wobble on Y axis
  const wobbleY = Math.sin(globalFrame * 0.04) * 3 + Math.sin(globalFrame * 0.02) * 2;

  // Subtle X axis movement for more depth
  const wobbleX = Math.sin(globalFrame * 0.025) * 2 + Math.cos(globalFrame * 0.015) * 1.5;

  const globalRotateY = baseRotateY + wobbleY;
  const globalRotateX = wobbleX;

  // Scale animation - ease out over 0.5 seconds (15 frames at 30fps)
  const scale = interpolate(
    frame,
    [0, 15],
    [0.92, 1],
    { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  return (
    <AbsoluteFill>
      {/* Fixed background layer */}
      <GlobalBackground />

      {/* Rotating content layer */}
      <AbsoluteFill
        style={{
          perspective: 2000,
          perspectiveOrigin: "50% 50%",
        }}
      >
        <AbsoluteFill
          style={{
            transform: `rotateX(${globalRotateX}deg) rotateY(${globalRotateY}deg) scale(${scale})`,
            transformStyle: "preserve-3d",
          }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Flip out wrapper - rotates content towards camera from bottom edge
const FlipOut: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  flipDuration?: number;
}> = ({ children, durationInFrames, flipDuration = 18 }) => {
  const frame = useCurrentFrame();

  // Start flipping in the last flipDuration frames
  const flipStart = durationInFrames - flipDuration;

  const rotateX = interpolate(
    frame,
    [flipStart, durationInFrames],
    [0, -90],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) }
  );

  const opacity = interpolate(
    frame,
    [flipStart, durationInFrames - 4],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        perspective: 1500,
        perspectiveOrigin: "50% 100%",
      }}
    >
      <AbsoluteFill
        style={{
          transform: `rotateX(${rotateX}deg)`,
          transformOrigin: "50% 100%",
          opacity,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SetupVideo: React.FC = () => {
  // Fast transition config
  const fastSpring = springTiming({ config: { damping: 25, stiffness: 200 }, durationInFrames: 12 });
  const quickFade = linearTiming({ durationInFrames: 8 });

  // Calculate start frames for each scene (accounting for transition overlaps)
  // Intro: 0-50, Terminal: 42-162, Catalog: 150-240, Simulation: 228-308, SingleWallet: 296-386, Outro: 378-418
  const introStart = 0;
  const terminalStart = 50 - 8; // after intro minus fade overlap
  const catalogStart = terminalStart + 120 - 12; // after terminal minus slide overlap
  const simulationStart = catalogStart + 90 - 12;
  const singleWalletStart = simulationStart + 80 - 12;
  const outroStart = singleWalletStart + 90 - 8;

  return (
    <TransitionSeries>
      {/* Quick Intro */}
      <TransitionSeries.Sequence durationInFrames={50}>
        <GlobalRotation startFrame={introStart}>
          <Intro />
        </GlobalRotation>
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={quickFade} />

      {/* Fast Terminal Setup with flip-out exit */}
      <TransitionSeries.Sequence durationInFrames={120}>
        <GlobalRotation startFrame={terminalStart}>
          <FlipOut durationInFrames={120} flipDuration={18}>
            <TerminalSetup />
          </FlipOut>
        </GlobalRotation>
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={quickFade} />

      {/* Catalog View */}
      <TransitionSeries.Sequence durationInFrames={60}>
        <GlobalRotation startFrame={catalogStart}>
          <CatalogScene />
        </GlobalRotation>
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={fastSpring} />

      {/* Simulation View */}
      <TransitionSeries.Sequence durationInFrames={60}>
        <GlobalRotation startFrame={simulationStart}>
          <SimulationScene />
        </GlobalRotation>
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={fastSpring} />

      {/* Single Wallet View */}
      <TransitionSeries.Sequence durationInFrames={60}>
        <GlobalRotation startFrame={singleWalletStart}>
          <SingleWalletScene />
        </GlobalRotation>
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={quickFade} />

      {/* Quick Outro */}
      <TransitionSeries.Sequence durationInFrames={40}>
        <GlobalRotation startFrame={outroStart}>
          <Intro />
        </GlobalRotation>
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
