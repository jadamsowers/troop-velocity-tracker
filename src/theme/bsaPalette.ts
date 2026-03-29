/**
 * Scouting America / BSA brand palette (official guide values).
 * Use these for programmatic color needs; theme CSS mirrors the same hex values.
 *
 * @see Brand guidelines (councils publish PDFs with these values)
 */
export const BSA_PALETTE = {
  /** Scouting America Red */
  red: "#CE1126",
  /** Scouting America Yellow */
  yellow: "#FCD116",
  /** Scouting America Tan */
  tan: "#B39475",
  /** Scouting America Gray */
  gray: "#515354",
  /** Scouting America Dark Blue (primary brand blue) */
  darkBlue: "#003F87",
  /** Scouting America Green */
  green: "#006B3F",
  /** Scouting America Dark Brown */
  darkBrown: "#330000",
  /** Scouting America Light Tan */
  lightTan: "#D6CEBD",
  /** Scouting America Dark Gray */
  darkGrayGreen: "#243E2C",
  /** Scouting America Pale Blue */
  paleBlue: "#9AB3D5",
  white: "#FFFFFF",
  black: "#000000",
} as const;

/** Screen-friendly accent for dark UIs (derived from Scouting America Dark Blue) */
export const BSA_UI = {
  accentOnDark: "#4a9fe8",
  accentOnLight: BSA_PALETTE.darkBlue,
  timelineStart: BSA_PALETTE.darkBlue,
  timelineEnd: BSA_PALETTE.green,
} as const;
