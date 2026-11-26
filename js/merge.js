// Papillon - merge the loose parts of a finished model (a boat, a helicopter) into one mesh for each material:
// a boat made of 30 little pieces costs 30 draw calls, the same boat in 11 pieces costs 11. Only direct children that are plain meshes are merged;
// groups (a sail that turns) and anything that is moved on its own stay as they are.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function mergeStatic(g) {
  const buckets = new Map();
  for (const c of g.children) {
    if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || Array.isArray(c.material) || !c.visible || c.userData.keep) continue;
    const k = c.material.uuid + (c.castShadow ? 'c' : '-') + (c.receiveShadow ? 'r' : '-') + c.renderOrder;
    let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(c);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = [];
    for (const m of list) {
      m.updateMatrix(); const ge = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const n of Object.keys(ge.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') ge.deleteAttribute(n);
      if (!ge.attributes.normal) ge.computeVertexNormals();
      if (!ge.attributes.uv) ge.setAttribute('uv', new T.BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2));
      geos.push(ge);
    }
    const merged = mergeGeometries(geos); if (!merged) continue;
    const f = list[0], m = new T.Mesh(merged, f.material); m.castShadow = f.castShadow; m.receiveShadow = f.receiveShadow; m.renderOrder = f.renderOrder;
    for (const c of list) g.remove(c);
    g.add(m);
  }
  return g;
}

// soft, rounded people: the figures come with flat faces; this gives each model smooth normals (done once per model, shared by everybody who wears it)
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export function smoothNormals(root) {
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m && m.flatShading) { m.flatShading = false; m.needsUpdate = true; } }
    if (!done.has(o.geometry)) { try { const g = o.geometry.clone(); g.deleteAttribute('normal'); const s = mergeVertices(g, 1e-4); s.computeVertexNormals(); done.set(o.geometry, s); } catch (e) { done.set(o.geometry, o.geometry); } }
    o.geometry = done.get(o.geometry);
  });
}
