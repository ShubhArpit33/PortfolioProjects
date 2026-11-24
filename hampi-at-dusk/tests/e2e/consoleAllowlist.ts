// Console warnings that are allowed during e2e runs (GAME_SPEC.md section 9, criterion 2).
// Only browser GPU / SwiftShader notices: they come from headless Chromium's software renderer,
// not from the game. Console *errors* are never allowed.

export const CONSOLE_WARNING_ALLOWLIST: RegExp[] = [
  /SwiftShader/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/i,
  /\[\.WebGL-[^\]]*\]\s*GL Driver Message/i,
];

export function isAllowedWarning(text: string): boolean {
  return CONSOLE_WARNING_ALLOWLIST.some((re) => re.test(text));
}
