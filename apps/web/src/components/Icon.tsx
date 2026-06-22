// Real iconography — original inline SVGs (never emoji, per §12 anti-slop).
// Single-color, currentColor-driven, 24x24 viewBox.
import type { CSSProperties } from "react";

const PATHS: Record<string, string> = {
  d20: "M12 2 3 7.2v9.6L12 22l9-5.2V7.2L12 2Zm0 2.3 6.5 3.75-6.5 2-6.5-2L12 4.3ZM5 9.1l6 1.85v7.2L5 15.6V9.1Zm14 0v6.5l-6 3.55v-7.2L19 9.1Z",
  sword:
    "M14.5 3 21 3l0 6.5-8.8 8.8 1.5 1.5-1.4 1.4-1.5-1.5-2.1 2.1-2.8-2.8 2.1-2.1-1.5-1.5L7 11.2 5.7 9.9 14.5 3Z",
  shield:
    "M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Zm0 2.2 6 2.25V11c0 3.7-2.4 6.5-6 8.6V4.2Z",
  heart:
    "M12 21S4 14.5 4 8.8C4 6 6 4 8.5 4 10.2 4 11.5 5 12 6.2 12.5 5 13.8 4 15.5 4 18 4 20 6 20 8.8 20 14.5 12 21 12 21Z",
  scroll:
    "M5 4h11a2 2 0 0 1 2 2v11a3 3 0 0 0 3 3H8a3 3 0 0 1-3-3V4Zm2 2v11a1 1 0 0 0 1 1h8.2A3 3 0 0 1 16 17V6H7Z",
  footprints:
    "M8 3c1.5 0 2.5 1.6 2.5 3.6S9.5 10 8 10 5.5 8.6 5.5 6.6 6.5 3 8 3Zm0 9c1.7 0 3 1 3 2.6 0 1.8-1 3.4-3 3.4s-3-1.6-3-3.4C5 13 6.3 12 8 12Zm8-9c1.5 0 2.5 1.6 2.5 3.6S17.5 10 16 10s-2.5-1.4-2.5-3.4S14.5 3 16 3Z",
  skull:
    "M12 2C7 2 4 5.5 4 10c0 2.5 1 4 2.5 5.2V18a2 2 0 0 0 2 2h1v-2h1v2h3v-2h1v2h1a2 2 0 0 0 2-2v-2.8C19 14 20 12.5 20 10c0-4.5-3-8-8-8Zm-3 8.5A1.5 1.5 0 1 1 9 13a1.5 1.5 0 0 1 0-2.5Zm6 0A1.5 1.5 0 1 1 15 13a1.5 1.5 0 0 1 0-2.5Z",
  flask:
    "M9 2h6v2h-1v4.2l4.4 8.2A2.5 2.5 0 0 1 16.2 20H7.8a2.5 2.5 0 0 1-2.2-3.6L10 8.2V4H9V2Zm3 9-2.6 4.8h5.2L12 11Z",
  flame:
    "M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c2 2 3 3.5 3 6a5 5 0 0 1-10 0c0-3 2-5 3-7 1-2 1-4 -1-6 2 0 4 1 5 0Z",
  compass:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.5A7.5 7.5 0 1 1 4.5 12 7.5 7.5 0 0 1 12 4.5Zm3.8 3.7-5 2-2 5 5-2 2-5Zm-3.8 2.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z",
  hourglass:
    "M6 2h12v2l-4 6 4 6v2H6v-2l4-6-4-6V2Zm3.2 2L12 8l2.8-4H9.2Z",
};

export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const d = PATHS[name] ?? PATHS.d20;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
