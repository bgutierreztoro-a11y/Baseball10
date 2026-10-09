import * as THREE from 'three';
import type { CharacterDef, CharacterId, Hand, QualitySettings, StadiumDef } from '../contracts';
import { MOUND, RUBBER_Z } from '../config/constants';
import { characterById, DEFAULT_CHARACTER } from '../config/characters';
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
  private batterRig: BatterRig;
  private characterId: CharacterId = DEFAULT_CHARACTER;
  private batColors: [string, string] | null = null;
  private playersVisible = true;

  constructor(renderer: Renderer, def: StadiumDef) {
    this.renderer = renderer;
    this.def = def;
    this.quality = renderer.quality;
    const scene = renderer.scene;
    this.stadium = createStadium(scene, def, this.quality);
    renderer.setAtmosphere(this.stadium.atmosphere.bloom, this.stadium.atmosphere.exposure);

    this.batterRig = this.adopt(characters.createBatter(this.quality, characterById(DEFAULT_CHARACTER).look));
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

  /** The current batter rig (replaced by setCharacter; don't cache it). */
  get batter(): BatterRig {
    return this.batterRig;
  }

  get character(): CharacterId {
    return this.characterId;
  }

  /**
   * Swaps the batter for another playable character: disposes the old rig and
   * builds the new one with the same handedness and bat colours. The peak aura
   * starts off. No-op if that character is already at the plate.
   */
  setCharacter(def: CharacterDef): void {
    if (def.id === this.characterId) return;
    this.characterId = def.id;
    const old = this.batterRig;
    old.dispose();
    const rig = this.adopt(characters.createBatter(this.quality, def.look));
    this.batterRig = rig;
    rig.root.visible = this.playersVisible;
    this.group.add(rig.root);
    if (this.batColors) rig.setBatColors(this.batColors[0], this.batColors[1]);
    this.setHandedness(this.hand);
  }

  /** Bat colours for the current and any future batter rig. */
  setBatColors(wood: string, grip: string): void {
    this.batterRig.setBatColors(wood, grip);
  }

  /** Records bat colours however they are set (also `world.batter.setBatColors`). */
  private adopt(rig: BatterRig): BatterRig {
    const set = rig.setBatColors.bind(rig);
    rig.setBatColors = (wood, grip) => {
      this.batColors = [wood, grip];
      set(wood, grip);
    };
    return rig;
  }

  /** Places the batter (and moves the umpire to the open side) for R/L. */
  setHandedness(hand: Hand): void {
    this.hand = hand;
    this.batter.setHandedness(hand);
    const side = hand === 'R' ? 1 : -1;
    this.batter.root.position.set(side * this.batter.stanceOffsetX, 0, 0.12);
    this.batter.root.rotation.y = -side * (Math.PI / 2);
    this.umpire.root.position.set(-side * 1.3, 0, -1.7);
  }

  get handedness(): Hand {
    return this.hand;
  }

  /**
   * Compiles the shader variants a pitch needs (ghosted catcher/umpire, ball,
   * trail, zone overlay) up front. Otherwise the first release frame stalls
   * on compilation exactly when the player is timing the swing.
   */
  warmUp(): void {
    const roots = [this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root, this.zone.group];
    const was = roots.map((o) => o.visible);
    roots.forEach((o) => (o.visible = true));
    this.catcher.setGhost(0.28);
    this.umpire.setGhost(0.28);
    this.ball.setVisible(true);
    this.ball.setTrail('pitch');
    // Two samples so the trail ribbon has geometry to draw.
    this.ball.setPosition({ x: 0, y: 1.2, z: 10 });
    this.ball.update(0);
    this.ball.setPosition({ x: 0, y: 1.1, z: 8 });
    this.ball.update(0);
    this.zone.showCrossing(0, 0.8, true);
    // Peak aura: compile its shaders now so activating it never stalls.
    this.batter.forcePeakVisible(true);
    // Draw once, through the same passes as a real frame (the render target's
    // colour space is part of the shader key), with culling off: some drivers
    // (and SwiftShader) only finish compiling when a program is first used.
    const culled: THREE.Object3D[] = [];
    this.group.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    this.renderer.render(0);
    culled.forEach((o) => (o.frustumCulled = true));
    this.zone.hideCrossing();
    this.batter.forcePeakVisible(false);
    this.ball.setTrail('off');
    this.ball.setVisible(false);
    this.ball.update(0);
    this.catcher.setGhost(1);
    this.umpire.setGhost(1);
    roots.forEach((o, i) => (o.visible = was[i]!));
  }

  /** Characters + ball visible only while batting (hidden on the title orbit). */
  setPlayersVisible(v: boolean): void {
    this.playersVisible = v;
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
