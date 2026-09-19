/**
 * Local aliases for the runtime ports.
 *
 * Re-exported from one place so capability adapters import a single module
 * instead of reaching into two packages each.
 */
export type {
  JarvisCapabilityAdapter,
  JarvisDispatchOptions,
  JarvisRuntimeAdapter,
} from '@tania/core/runtime';

export type {
  Evidence,
  JarvisArtifact,
  JarvisCapability,
  JarvisCapabilityStatus,
  JarvisCommand,
  JarvisError,
  JarvisResult,
  JarvisStatus,
} from '@tania/types';
