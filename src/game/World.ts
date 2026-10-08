import * as THREE from 'three';
import type { Hand, QualitySettings, StadiumDef } from '../contracts';
import { BATTERS_BOX_X, MOUND, RUBBER_Z } from '../config/constants';
import type { BallView, BatterRig, CatcherRig, Effects, PitcherRig, StadiumView, UmpireRig } from '../render/api';
import { characters } from '../render/characters';
import { createBallView, createEffects } from '../render/fx';
import type { Renderer } from '../render/Renderer';
import { createStadium } from '../render/stadium';
import { ZoneOverlay } from '../render/ZoneOverlay';

/**
 * Everything 3D for one ballpark: stadium, the four characters, ball, effects
 * and the strike-zone overlay. Rebuilt when the stadium or quality tier changes.
 */
export class World {
  readonly stadium: StadiumView;
  readonly batter: BatterRig;
  readonly pitcher: PitcherRig;
  readonly catcher: CatcherRig;
  readonly umpire: UmpireRig;
  readonly ball: BallView;
  readonly fx: Effects;
  readonly zone: ZoneOverlay;
  readonly def: StadiumDef;
  readonly quality: QualitySettings;
  private readonly group = new THREE.Group();
  private readonly renderer: Renderer;
  private hand: Hand = 'R';

  constructor(renderer: Renderer, def: StadiumDef) {
    this.renderer = renderer;
    this.def = def;
    this.quality = renderer.quality;
    const scene = renderer.scene;
    this.stadium = createStadium(scene, def, this.quality);
    renderer.setAtmosphere(this.stadium.atmosphere.bloom, this.stadium.atmosphere.exposure);

    this.batter = characters.createBatter(this.quality);
    this.pitcher = characters.createPitcher(this.quality);
    this.catcher = characters.createCatcher(this.quality);
    this.umpire = characters.createUmpire(this.quality);
    this.pitcher.root.position.set(0, MOUND.height, RUBBER_Z);
    this.pitcher.root.rotation.y = Math.PI;
    this.catcher.root.position.set(0, 0, -0.95);
    this.ball = createBallView(this.quality);
    this.fx = createEffects(this.quality);
    this.zone = new ZoneOverlay();
    this.group.add(this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root, this.ball.root, this.fx.root, this.zone.group);
    scene.add(this.group);
    this.setHandedness('R');
    this.ball.setVisible(false);
  }

  /** Places the batter (and moves the umpire to the open side) for R/L. */
  setHandedness(hand: Hand): void {
    this.hand = hand;
    this.batter.setHandedness(hand);
    const side = hand === 'R' ? 1 : -1;
    this.batter.root.position.set(side * (BATTERS_BOX_X - 0.03), 0, 0.12);
    this.batter.root.rotation.y = -side * (Math.PI / 2);
    this.umpire.root.position.set(-side * 1.3, 0, -1.7);
  }

  get handedness(): Hand {
    return this.hand;
  }

  /** Characters + ball visible only while batting (hidden on the title orbit). */
  setPlayersVisible(v: boolean): void {
    for (const o of [this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root]) o.visible = v;
    this.zone.group.visible = v;
  }

  update(dt: number, elapsed: number, excitement: number, camera: THREE.Camera): void {
    this.stadium.update(dt, elapsed, excitement);
    this.batter.update(dt);
    this.pitcher.update(dt);
    this.catcher.update(dt);
    this.umpire.update(dt);
    this.ball.update(dt);
    this.fx.update(dt, camera);
    this.zone.update(dt);
  }

  dispose(): void {
    this.renderer.scene.remove(this.group);
    this.stadium.dispose();
    this.zone.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
  }
}
