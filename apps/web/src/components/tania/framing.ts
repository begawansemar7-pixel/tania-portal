import { Box3, MathUtils, Vector3, type Object3D, type PerspectiveCamera } from 'three';

/** How much of the model's height the camera frames: head and shoulders. */
export const FRAMED_HEIGHT_RATIO = 0.42;

/** Headroom left *above* the model, as a fraction of its height. */
export const FRAMED_HEADROOM = 0.05;

/** Kept back a little so a leaning head never clips the near plane. */
export const DISTANCE_PADDING = 1.15;

export interface Framing {
  /** World point the camera looks at. */
  target: Vector3;
  /** How far back the camera sits along +Z. */
  distance: number;
  /** Height of the region the camera frames, for callers that need to check. */
  framedHeight: number;
}

/**
 * Frames the upper body of a model of unknown size.
 *
 * The avatar asset is provided separately and could be authored at any scale or
 * origin — a VRM in metres, a GLB in centimetres, a rig whose feet are at the
 * origin or whose centre is. Hard-coding a camera position would mean the first
 * thing that happens when the real asset lands is that it is framed wrong.
 *
 * So the framing is derived from the model's own bounds: take the band near the
 * top where a head is, and pull back far enough for it to fill the view.
 */
export function framing(box: Box3, fovDegrees: number, aspect = 1): Framing {
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());

  const height = Math.max(size.y, 1e-6);
  const framedHeight = height * FRAMED_HEIGHT_RATIO;

  // The band's top sits *above* the model, so the crown of the head is never
  // cropped — the offset is headroom, not an inset.
  const bandTop = box.max.y + height * FRAMED_HEADROOM;
  const target = new Vector3(centre.x, bandTop - framedHeight / 2, centre.z);

  // Fit by whichever dimension is tighter, so a wide model is not cropped.
  const vertical = MathUtils.degToRad(fovDegrees);
  const byHeight = framedHeight / 2 / Math.tan(vertical / 2);

  const framedWidth = Math.max(size.x, framedHeight);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.1));
  const byWidth = framedWidth / 2 / Math.tan(horizontal / 2);

  return { target, distance: Math.max(byHeight, byWidth) * DISTANCE_PADDING, framedHeight };
}

/**
 * Points a camera at a model.
 *
 * Prefers the head bone when the rig exposes one — it is where a viewer looks,
 * and it is more stable than a bounding box that changes with every gesture.
 */
export function frameCamera(
  root: Object3D,
  camera: PerspectiveCamera,
  head?: Object3D,
): Framing {
  const box = new Box3().setFromObject(root);
  const computed = framing(box, camera.fov, camera.aspect);

  if (head) {
    const headPosition = head.getWorldPosition(new Vector3());
    // Only the height is taken from the bone: a head turned to one side must
    // not drag the camera sideways with it.
    computed.target.setY(headPosition.y);
  }

  camera.position.set(computed.target.x, computed.target.y, computed.target.z + computed.distance);
  camera.lookAt(computed.target);
  camera.near = Math.max(0.01, computed.distance / 100);
  camera.far = computed.distance * 100;
  camera.updateProjectionMatrix();

  return computed;
}
