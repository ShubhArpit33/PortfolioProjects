// All tuning values (GAME_SPEC.md section 3).
// Units: px, px/s, px/s^2, degrees. 1 tile = 16 px.
export const CONFIG = {
  gravity: 700,
  accel: 160,            // throttle, on the ground
  brake: 400,
  coastDrag: 60,         // no input
  topSpeed: 240,
  boostSpeed: 360,       // top speed while boosting
  boostAccel: 500,
  boostDrainPerSec: 0.6, // meter is 0..1
  boostRegenPerSec: 0.08,
  boostCleanLanding: 0.25,
  boostDiya: 0.1,
  boostFlip: 0.35,           // meter refill per full flip landed without crashing (v1.3)
  hopVelocity: 280,
  slopeGravityFactor: 0.5,   // how much slopes slow you on the way up / speed you up on the way down
  airTiltSpeed: 180,         // deg/s with up/down (the rate of a tap, and where a hold starts)
  airTiltAccel: 700,         // deg/s^2 added while the same tilt key stays held (v1.3, for flips)
  airTiltMaxSpeed: 450,      // deg/s cap of a held tilt: a full flip takes about 0.92 s
  airNoseDropSpeed: 20,      // deg/s drift with no input
  safeLandingAngle: 35,      // |bike angle - slope angle| at or below this = safe
  cleanLandingAngle: 10,     // at or below this = "CLEAN!" + boost bonus
  monkeyStumbleFactor: 0.4,  // speed multiplier when hitting a monkey
  honkRange: 120,
  // Look-ahead (px ahead of the bike that the camera aims at) grows with speed (v1.3). The smoothing below
  // makes the camera trail a moving bike by about v * 0.158 s, so these put the bike at screen x of about
  // 184 at rest, 170 at topSpeed and 131 at boostSpeed.
  cameraLookAhead: 108,      // at topSpeed (was a fixed 80)
  cameraLookAheadRest: 56,   // at a standstill
  cameraLookAheadBoost: 166, // at boostSpeed: the camera pulls back so more of the road ahead shows
  cameraLookSmoothS: 0.3,    // time constant of the look-ahead smoothing (s)
  cameraBumpPerImpact: 0.35, // landing bump: kick (px/s) per px/s of landing speed into the ground
  cameraBumpMaxPx: 5,
  cameraLerp: 0.1,           // per 1/60 s; see section 4 Camera
  respawnDelayMs: 1000,
  bikeHitW: 24,              // bike AABB width
  bikeHitH: 16,              // bike AABB height
  diyaRadius: 10,
  airborneEps: 0.25,         // px above the surface that counts as airborne
  wallTolerance: 4,          // px below a gap's far lip that still snaps up
  minAirMsForLanding: 120,   // shorter airs re-attach silently
  angleEaseDegPerSec: 720,   // grounded angle easing toward the slope
  cowCrashSpeed: 60,
  reverseSpeed: 45,          // top speed backing up ("paddling with the feet"), grounded only
  reverseAccel: 120,
  reverseHoldDelayMs: 300,   // Left held through a stop: pause this long before backing up
};

export type Config = typeof CONFIG;
