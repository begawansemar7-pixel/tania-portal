export { AvatarEventBus, avatarEvents } from './event-bus';
export type { AvatarEventListener } from './event-bus';
export { VoiceAvatarBridge, avatarStateForVoice } from './voice-bridge';
export {
  decideAvatar,
  readAvatarEnvironment,
  FALLBACK_REASON_TEXT,
  MIN_SCENE_WIDTH,
  MIN_DEVICE_MEMORY_GB,
} from './capability';
export type { AvatarDecision, AvatarEnvironment, AvatarQuality } from './capability';
export { REDUCED_QUALITY_MEMORY_GB, REDUCED_QUALITY_CORES } from './capability';

export { VisemeController, VISEME_SHAPES, MOUTH_REST, mix } from './viseme-controller';
export type { MouthShape } from './viseme-controller';
export { planUtterance, planWord, wordVisemes, estimateDuration } from './viseme';

export { ExpressionController, EXPRESSION_WEIGHTS, damp } from './expression-controller';
export type { FaceWeights } from './expression-controller';

export { GestureController, GESTURE_CLIPS, IDLE_CLIPS, resolveClip, isOneShot } from './gesture-controller';
export type { GesturePlan } from './gesture-controller';

export {
  IdleMotion,
  GazeRegistry,
  anglesForRegion,
  GAZE_ANGLES,
  MAX_YAW,
  MAX_PITCH,
  GAZE_SECONDS,
  REGION_GAZE_SCALE,
} from './idle-motion';
export type { GazeRect } from './idle-motion';
export { useGazeRegistry, useGazeRegion, useGazeAnchor } from './use-gaze';
