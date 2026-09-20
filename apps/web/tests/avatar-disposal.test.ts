import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { MorphTargetRig } from '@/components/tania/rig';

/**
 * Releasing GPU memory when the avatar unmounts.
 *
 * Three.js frees nothing when an object leaves the scene: geometries, materials
 * and textures stay on the GPU until disposed by hand. The avatar is mounted
 * and unmounted routinely — switching screens, crossing the mobile breakpoint,
 * a hot reload — so a missed `dispose` is a leak that grows until the tab is
 * reloaded, and it is invisible in every other test because nothing renders.
 *
 * `MorphTargetRig.dispose` walks the tree and releases all three kinds. Nothing
 * verified that, so deleting any one line would have passed the whole suite.
 */

interface Disposable {
  dispose: ReturnType<typeof vi.fn>;
}

function texture(): Disposable & { isTexture: true } {
  return { isTexture: true, dispose: vi.fn() };
}

/**
 * A mesh shaped the way `dispose` reads one.
 *
 * Built by hand rather than loaded: a real GLB would need a GPU context, and
 * what is under test is the traversal, not three.js itself.
 */
function mesh(options: { materials?: number; texturesPerMaterial?: number } = {}) {
  const node = new Object3D() as unknown as {
    geometry: Disposable;
    material: unknown;
    isSkinnedMesh: boolean;
    morphTargetDictionary?: Record<string, number>;
    morphTargetInfluences?: number[];
  } & Object3D;

  node.geometry = { dispose: vi.fn() };
  node.isSkinnedMesh = true;
  node.morphTargetDictionary = { jawOpen: 0, mouthSmile: 1 };
  node.morphTargetInfluences = [0, 0];

  const build = () => {
    const material: Record<string, unknown> & Disposable = { dispose: vi.fn() };
    for (let index = 0; index < (options.texturesPerMaterial ?? 1); index += 1) {
      material[`map${index}`] = texture();
    }
    return material;
  };

  const count = options.materials ?? 1;
  node.material = count === 1 ? build() : Array.from({ length: count }, build);

  return node;
}

function texturesOf(material: Record<string, unknown>): Disposable[] {
  return Object.values(material).filter(
    (value): value is Disposable & { isTexture: true } =>
      typeof value === 'object' && value !== null && (value as { isTexture?: boolean }).isTexture === true,
  );
}

describe('releasing the avatar model', () => {
  it('disposes geometry', () => {
    const root = new Object3D();
    const skinned = mesh();
    root.add(skinned);

    new MorphTargetRig(root).dispose();

    expect(skinned.geometry.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the material and every texture hanging off it', () => {
    // Textures are the expensive ones: a 2K albedo map outlives the material
    // that referenced it if only the material is disposed.
    const root = new Object3D();
    const skinned = mesh({ texturesPerMaterial: 3 });
    root.add(skinned);

    const material = skinned.material as Record<string, unknown> & Disposable;
    const maps = texturesOf(material);
    expect(maps).toHaveLength(3);

    new MorphTargetRig(root).dispose();

    expect(material.dispose).toHaveBeenCalledOnce();
    for (const map of maps) expect(map.dispose).toHaveBeenCalledOnce();
  });

  it('handles a mesh with several materials', () => {
    // Multi-material meshes are normal in exported characters — body, hair,
    // eyes — and an implementation that assumed one would leak the rest.
    const root = new Object3D();
    const skinned = mesh({ materials: 3 });
    root.add(skinned);

    const materials = skinned.material as Array<Record<string, unknown> & Disposable>;

    new MorphTargetRig(root).dispose();

    for (const material of materials) {
      expect(material.dispose).toHaveBeenCalledOnce();
      for (const map of texturesOf(material)) expect(map.dispose).toHaveBeenCalledOnce();
    }
  });

  it('reaches meshes nested deep in the hierarchy', () => {
    // Exported rigs nest: Armature > Hips > ... > Head > mesh. Disposing only
    // direct children would free almost nothing.
    const root = new Object3D();
    const armature = new Object3D();
    const head = new Object3D();
    const skinned = mesh();

    head.add(skinned);
    armature.add(head);
    root.add(armature);

    new MorphTargetRig(root).dispose();

    expect(skinned.geometry.dispose).toHaveBeenCalledOnce();
  });

  it('disposes every mesh, not just the first', () => {
    const root = new Object3D();
    const meshes = [mesh(), mesh(), mesh()];
    for (const skinned of meshes) root.add(skinned);

    new MorphTargetRig(root).dispose();

    for (const skinned of meshes) expect(skinned.geometry.dispose).toHaveBeenCalledOnce();
  });

  it('survives a tree with plain nodes and no materials', () => {
    // Lights, empties and bones sit in the same hierarchy; dispose must walk
    // past them rather than throw on the first one without a geometry.
    const root = new Object3D();
    root.add(new Object3D());
    root.add(mesh());

    expect(() => new MorphTargetRig(root).dispose()).not.toThrow();
  });

  it('forgets its morph targets, so a disposed rig cannot still be driven', () => {
    const root = new Object3D();
    root.add(mesh());

    const rig = new MorphTargetRig(root);
    expect(rig.morphNames().length).toBeGreaterThan(0);

    rig.dispose();

    expect(rig.morphNames()).toEqual([]);
  });

  it('is safe to call twice', () => {
    // React can run a cleanup more than once in development.
    const root = new Object3D();
    root.add(mesh());
    const rig = new MorphTargetRig(root);

    rig.dispose();
    expect(() => rig.dispose()).not.toThrow();
  });
});
