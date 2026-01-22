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

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fast logo entrance
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 200 },
  });

  const logoScale = interpolate(logoProgress, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoProgress, [0, 1], [0, 1]);

  // Fast title (delayed slightly)
  const titleProgress = spring({
    frame: frame - 8,
    fps,
    config: { damping: 20, stiffness: 200 },
  });

  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);
  const titleY = interpolate(titleProgress, [0, 1], [20, 0]);

  // Fast subtitle
  const subtitleProgress = spring({
    frame: frame - 14,
    fps,
    config: { damping: 25, stiffness: 200 },
  });

  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 100,
          height: 100,
          marginBottom: 24,
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        <Img
          src={staticFile("funeralvision.svg")}
          style={{ width: 100, height: 100 }}
        />
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 52,
          fontWeight: 800,
          fontFamily: FONT.sans,
          background: `linear-gradient(135deg, ${THEME.pink}, ${THEME.pinkLight})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          letterSpacing: -1,
        }}
      >
        Funeral Vision
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 18,
          color: THEME.textSecondary,
          marginTop: 12,
          opacity: subtitleOpacity,
          fontFamily: FONT.sans,
          letterSpacing: 2,
        }}
      >
        Who is digging your grave?
      </p>
    </AbsoluteFill>
  );
};
