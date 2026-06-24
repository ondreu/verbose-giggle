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
  // Bound journal/diary — distinct from the scroll used elsewhere (#deník).
  book:
    "M6 2h11a2 2 0 0 1 2 2v16a1 1 0 0 1-1.45.9L13 18.6l-4.55 2.3A1 1 0 0 1 7 20V4H6a1 1 0 0 1 0-2Zm3 2v13.4l3.55-1.8a1 1 0 0 1 .9 0L17 17.4V4H9Zm2 3h4v2h-4V7Z",
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
  gear:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1.4-8h2.8l.5 2.4 1.7.7 2-1.3 2 2-1.3 2 .7 1.7 2.4.5v2.8l-2.4.5-.7 1.7 1.3 2-2 2-2-1.3-1.7.7-.5 2.4h-2.8l-.5-2.4-1.7-.7-2 1.3-2-2 1.3-2-.7-1.7L2 13.4v-2.8l2.4-.5.7-1.7-1.3-2 2-2 2 1.3 1.7-.7L10.6 2Z",
  camera:
    "M9 4 7.8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.8L15 4H9Zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  // Curved back-arrow for "undo / revert a turn" (#25).
  undo:
    "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z",
  // Lined document for "summary / recap" (#25), distinct from the scroll/diary.
  document:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  // Clipboard with a check, for the quest log (#19).
  quest:
    "M9 2h6a1 1 0 0 1 1 1h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1-1Zm0 2v1h6V4H9Zm-2 3v13h10V7H7Zm3.4 9.4-2.1-2.1 1.1-1.1 1 1 2.9-2.9 1.1 1.1-4 4Z",
  // Menu/navigation glyphs (#47 home restructure).
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  archive:
    "M3 4h18v5H3V4Zm2 7h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9Zm4 2v2h6v-2H9Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z",
  coins:
    "M12 3c-4 0-7 1.3-7 3v3c0 1.7 3 3 7 3s7-1.3 7-3V6c0-1.7-3-3-7-3Zm-7 9v3c0 1.7 3 3 7 3s7-1.3 7-3v-3c0 1.7-3 3-7 3s-7-1.3-7-3Z",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.5A7.5 7.5 0 1 1 4.5 12 7.5 7.5 0 0 1 12 4.5ZM11 10h2v7h-2v-7Zm1-3.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z",
  server:
    "M4 4h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 3v1h2V7H6Zm-2 6h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm2 3v1h2v-1H6Z",
  speaker:
    "M11 4 6 8H3v8h3l5 4V4Zm4.6 3.4a5 5 0 0 1 0 9.2l-1-1.8a3 3 0 0 0 0-5.6l1-1.8Z",
  upload:
    "M12 3 7 8h3v7h4V8h3l-5-5ZM5 18h14v2H5v-2Z",
  // Circular arrow — regenerate / retry a turn (#47, stubbed).
  refresh:
    "M17.65 6.35A8 8 0 1 0 19.74 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z",
  // Two opposed arrows — swap to a different model (#47, stubbed).
  swap:
    "M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7Zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2Z",
  // Vertical ellipsis — per-message action menu (#47).
  dots:
    "M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
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
