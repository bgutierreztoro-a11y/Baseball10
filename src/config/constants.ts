/**
 * Physical constants and field geometry. All world units are SI (meters,
 * seconds, kilograms). See docs/CONVENTIONS.md for the coordinate system:
 *
 *   +X  first-base side (catcher's right when looking at the pitcher)
 *   +Y  up
 *   +Z  toward center field / the pitcher
 *   origin = back tip of home plate (the apex of the diamond)
 */

export const FT = 0.3048;
export const IN = 0.0254;
export const MPH = 0.44704;
export const RPM_TO_RAD_S = (2 * Math.PI) / 60;
export const DEG = Math.PI / 180;

export const GRAVITY = 9.81;
export const SEA_LEVEL_AIR_DENSITY = 1.225;

export const BALL = {
  mass: 0.145,
  radius: 0.0366,
  /** Rendered radius: slightly exaggerated so the ball stays readable at 18 m. */
  visualRadius: 0.052,
  area: Math.PI * 0.0366 * 0.0366,
  dragCoefficient: 0.37,
} as const;

export const PLATE = {
  width: 17 * IN,
  depth: 17 * IN,
  /** Z of the front edge (toward the pitcher) — strike zone and contact plane. */
  frontZ: 17 * IN,
} as const;

/** Contact plane: where timing and PCI are judged (front edge of the plate). */
export const CONTACT_PLANE_Z = PLATE.frontZ;

export const STRIKE_ZONE = {
  /** Half width including the ball radius (a pitch that clips the edge is a strike). */
  halfWidth: PLATE.width / 2 + BALL.radius,
  bottom: 0.48,
  top: 1.07,
  get centerY(): number {
    return (this.bottom + this.top) / 2;
  },
} as const;

export const RUBBER_Z = 60.5 * FT;
export const PITCHER_EXTENSION = 6.2 * FT;
export const RELEASE_Z = RUBBER_Z - PITCHER_EXTENSION;
export const RELEASE_HEIGHT = 1.78;
/** Release X magnitude for a right-handed pitcher (negative X = 3B side). */
export const RELEASE_SIDE = 0.55;

export const BASE_DISTANCE = 90 * FT;
export const MOUND = {
  centerZ: 59 * FT,
  radius: 9 * FT,
  height: 10 * IN,
} as const;

/** Foul lines run at ±45° from the +Z axis. */
export const FOUL_LINE_ANGLE = 45 * DEG;

/** Batter's box centre offset from the plate centre line (absolute X). */
export const BATTERS_BOX_X = 0.95;

export const FIXED_DT = 1 / 240;
