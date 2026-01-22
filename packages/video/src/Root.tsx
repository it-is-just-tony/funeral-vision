import { Composition } from "remotion";
import { SetupVideo } from "./SetupVideo";

// Total duration calculation (fast-paced):
// Intro: 50 frames
// Transition: -8 frames
// Terminal: 120 frames
// Transition: -12 frames
// Catalog: 90 frames
// Transition: -12 frames
// Simulation: 80 frames
// Transition: -12 frames
// Single Wallet: 90 frames
// Transition: -8 frames
// Outro: 40 frames
// Total: 50 + 120 + 90 + 80 + 90 + 40 - 8 - 12 - 12 - 12 - 8 = 418 frames (~14 seconds at 30fps)

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SetupVideo"
      component={SetupVideo}
      durationInFrames={337}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
