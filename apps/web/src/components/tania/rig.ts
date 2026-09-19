import type { Bone, Object3D, SkinnedMesh } from 'three';

/**
 * What the avatar components need from a loaded model.
 *
 * An abstraction rather than a `SkinnedMesh` because GLB and VRM expose the
 * same ideas differently — a VRM has an expression manager and a standardised
 * humanoid skeleton, a plain GLB has morph target dictionaries and whatever
 * bone names the artist chose. Everything above this line works on the
 * abstraction, so supporting a new format is one adapter rather than a rewrite.
 */
export interface AvatarRig {
  /** Sets a blendshape by name. Unknown names are ignored, not an error. */
  setMorph(name: string, weight: number): void;
  /** Blendshape names the rig actually has, for diagnostics. */
  morphNames(): string[];
  /** The head bone, for gaze. Absent on rigs that do not expose one. */
  head?: Bone | Object3D;
  /** Eye bones, when the rig has them. */
  leftEye?: Bone | Object3D;
  rightEye?: Bone | Object3D;
  /** Chest or upper body, for breathing. */
  chest?: Bone | Object3D;
  /** Releases GPU memory this rig's model holds. */
  dispose?(): void;
}

/**
 * A rig backed by GLB morph targets.
 *
 * Name matching is case-insensitive and ignores separators, because exporters
 * disagree about `mouthSmile`, `mouth_smile` and `MouthSmile` — and an avatar
 * whose face never moves because of an underscore is a hard bug to see.
 */
export class MorphTargetRig implements AvatarRig {
  private readonly targets = new Map<string, Array<{ mesh: SkinnedMesh; index: number }>>();

  head?: Bone | Object3D;
  leftEye?: Bone | Object3D;
  rightEye?: Bone | Object3D;
  chest?: Bone | Object3D;

  private readonly root: Object3D;

  constructor(root: Object3D) {
    this.root = root;
    root.traverse((child) => {
      const mesh = child as SkinnedMesh;

      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          const key = normalise(name);
          const entry = this.targets.get(key) ?? [];
          entry.push({ mesh, index });
          this.targets.set(key, entry);
        }
      }

      const bone = normalise(child.name);
      if (bone === 'head' && !this.head) this.head = child;
      if ((bone === 'lefteye' || bone === 'eyel') && !this.leftEye) this.leftEye = child;
      if ((bone === 'righteye' || bone === 'eyer') && !this.rightEye) this.rightEye = child;
      if ((bone === 'chest' || bone === 'spine2' || bone === 'upperchest') && !this.chest) {
        this.chest = child;
      }
    });
  }

  /**
   * Releases the GPU memory this model holds.
   *
   * Three.js does not free buffers or textures when an object leaves the
   * scene, so an avatar that is mounted and unmounted a few times — switching
   * screens, resizing past the mobile breakpoint — leaks until the tab is
   * reloaded. Every geometry, material and texture is disposed explicitly.
   */
  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as SkinnedMesh;
      mesh.geometry?.dispose?.();

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;

        for (const value of Object.values(material as unknown as Record<string, unknown>)) {
          const texture = value as { isTexture?: boolean; dispose?: () => void };
          if (texture?.isTexture) texture.dispose?.();
        }

        material.dispose?.();
      }
    });

    this.targets.clear();
  }

  setMorph(name: string, weight: number): void {
    const entries = this.targets.get(normalise(name));
    if (!entries) return;

    const clamped = Math.max(0, Math.min(1, weight));
    for (const { mesh, index } of entries) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = clamped;
    }
  }

  morphNames(): string[] {
    return [...this.targets.keys()];
  }
}

/** A rig that records what it was told, for tests and for a missing model. */
export class NullRig implements AvatarRig {
  readonly weights = new Map<string, number>();

  setMorph(name: string, weight: number): void {
    this.weights.set(normalise(name), weight);
  }

  morphNames(): string[] {
    return [...this.weights.keys()];
  }
}

export function normalise(name: string): string {
  return name.toLowerCase().replace(/[_\-.\s]/g, '');
}
