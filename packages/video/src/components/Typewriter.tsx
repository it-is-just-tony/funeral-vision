import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { THEME, FONT } from "../theme";

export type TerminalLine = {
  text: string;
  color?: string;
  isCommand?: boolean;
  prefix?: string;
  instant?: boolean; // Show instantly without typing
};

type TypewriterProps = {
  lines: TerminalLine[];
  charFrames?: number;
  lineDelay?: number;
  startFrame?: number;
};

// Blinking cursor component
export const Cursor: React.FC<{ visible: boolean }> = ({ visible }) => {
  const frame = useCurrentFrame();

  const opacity = visible
    ? interpolate(frame % 30, [0, 15, 30], [1, 0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <span
      style={{
        opacity,
        color: THEME.textPrimary,
        marginLeft: 2,
        fontWeight: 400,
      }}
    >
      _
    </span>
  );
};

// Calculate how many characters should be visible at a given frame
const getTypedText = (
  frame: number,
  text: string,
  startFrame: number,
  charFrames: number,
  instant: boolean
): string => {
  if (instant) return frame >= startFrame ? text : "";
  const elapsed = frame - startFrame;
  if (elapsed < 0) return "";
  const typedChars = Math.floor(elapsed / charFrames);
  return text.slice(0, Math.min(typedChars, text.length));
};

// Single line component
const TypewriterLine: React.FC<{
  line: TerminalLine;
  startFrame: number;
  charFrames: number;
  showCursor: boolean;
}> = ({ line, startFrame, charFrames, showCursor }) => {
  const frame = useCurrentFrame();

  const typedText = getTypedText(
    frame,
    line.text,
    startFrame,
    charFrames,
    line.instant || false
  );
  const isComplete = typedText.length === line.text.length;
  const isVisible = frame >= startFrame;

  if (!isVisible && !typedText) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 24,
        fontFamily: FONT.mono,
      }}
    >
      {/* Command prompt prefix */}
      {line.isCommand && (
        <>
          <span style={{ color: THEME.terminalGreen, marginRight: 8 }}>➜</span>
          <span style={{ color: THEME.terminalCyan, marginRight: 8 }}>
            {line.prefix || "~/funeral-vision"}
          </span>
        </>
      )}
      {/* Line content */}
      <span style={{ color: line.color || THEME.textPrimary }}>{typedText}</span>
      {/* Cursor */}
      {showCursor && !isComplete && <Cursor visible={true} />}
    </div>
  );
};

// Main Typewriter component that renders multiple lines
export const Typewriter: React.FC<TypewriterProps> = ({
  lines,
  charFrames = 1.5,
  lineDelay = 15,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();

  // Calculate the start frame for each line
  const lineStartFrames: number[] = [];
  let currentFrame = startFrame;

  for (const line of lines) {
    lineStartFrames.push(currentFrame);
    if (line.instant) {
      currentFrame += lineDelay;
    } else {
      currentFrame += line.text.length * charFrames + lineDelay;
    }
  }

  // Determine which line is currently being typed
  let currentLineIndex = 0;
  for (let i = 0; i < lineStartFrames.length; i++) {
    const lineEndFrame = lines[i].instant
      ? lineStartFrames[i] + 1
      : lineStartFrames[i] + lines[i].text.length * charFrames;

    if (frame < lineEndFrame) {
      currentLineIndex = i;
      break;
    }
    currentLineIndex = i;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {lines.map((line, index) => (
        <TypewriterLine
          key={index}
          line={line}
          startFrame={lineStartFrames[index]}
          charFrames={charFrames}
          showCursor={index === currentLineIndex}
        />
      ))}
    </div>
  );
};

// Export utility to calculate total duration of typewriter animation
export const getTypewriterDuration = (
  lines: TerminalLine[],
  charFrames: number = 1.5,
  lineDelay: number = 15
): number => {
  let totalFrames = 0;
  for (const line of lines) {
    if (line.instant) {
      totalFrames += lineDelay;
    } else {
      totalFrames += line.text.length * charFrames + lineDelay;
    }
  }
  return Math.ceil(totalFrames);
};
