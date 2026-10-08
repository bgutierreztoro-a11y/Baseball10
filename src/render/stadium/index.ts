import * as THREE from 'three';
import type { CreateStadium, StadiumView } from '../api';
import { atmosphereFor, createSky } from './atmosphere';
import { createField } from './field';
import { createScenery } from './scenery';
import { createScoreboard } from './scoreboard';
import { createStructures } from './structures';
import { createTargets } from './targets';

/**
 * Builds a complete procedural ballpark for a StadiumDef and configures the
 * scene (sky, fog, lights). Everything is generated at runtime; dispose()
 * releases every GPU resource it created.
 */
export const createStadium: CreateStadium = (scene, def, quality): StadiumView => {
  const atm = atmosphereFor(def);
  const root = new THREE.Group();
  root.name = `stadium:${def.id}`;

  const sky = createSky(atm, quality);
  const field = createField(def, quality);
  const structures = createStructures(def, quality, atm);
  const scenery = createScenery(def, quality, atm);
  const scoreboard = createScoreboard(def, atm, structures.cfBack);
  const targets = createTargets();
  root.add(sky.group, field.group, structures.group, scenery.group, scoreboard.group, targets.group);

  // Lighting.
  const hemi = new THREE.HemisphereLight(atm.hemiSky, atm.hemiGround, atm.hemiIntensity);
  root.add(hemi);
  const key = new THREE.DirectionalLight(atm.keyColor, atm.keyIntensity);
  const dir = new THREE.Vector3(...atm.sunDir).normalize();
  // The key light follows the play area: a tight shadow frustum around plate → mound.
  key.position.copy(dir.clone().multiplyScalar(60)).add(new THREE.Vector3(0, 0, 8));
  key.target.position.set(0, 0, 8);
  key.castShadow = quality.shadows;
  if (quality.shadows) {
    key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = key.shadow.camera;
    cam.left = -14;
    cam.right = 14;
    cam.top = 16;
    cam.bottom = -16;
    cam.near = 1;
    cam.far = 140;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
  }
  root.add(key, key.target);
  if (atm.night) {
    // Banks of stadium lights from both sides keep night games readable.
    const fillA = new THREE.DirectionalLight('#dfe7ff', 0.7);
    fillA.position.set(60, 50, 40);
    const fillB = new THREE.DirectionalLight('#dfe7ff', 0.55);
    fillB.position.set(-60, 50, 40);
    root.add(fillA, fillB);
  }

  scene.add(root);
  const prevFog = scene.fog;
  const prevBg = scene.background;
  scene.fog = new THREE.Fog(atm.fogColor, atm.fogNear, atm.fogFar);
  scene.background = new THREE.Color(atm.skyHorizon);

  return {
    root,
    keyLight: key,
    atmosphere: { bloom: atm.bloom, exposure: atm.exposure, night: atm.night, fogFar: atm.fogFar },
    update(dt, elapsed, excitement) {
      void dt;
      sky.update(elapsed);
      structures.update(elapsed, excitement);
      scenery.update(elapsed);
      scoreboard.update(elapsed);
      targets.update(elapsed);
    },
    setScoreboard(data) {
      scoreboard.set(data);
    },
    setTargets(list) {
      targets.set(list);
    },
    markTargetHit(index) {
      targets.hit(index);
    },
    dispose() {
      scene.remove(root);
      scene.fog = prevFog;
      scene.background = prevBg;
      sky.dispose();
      field.dispose();
      structures.dispose();
      scenery.dispose();
      scoreboard.dispose();
      targets.dispose();
    },
  };
};
