import * as THREE from 'three';
import type { CharacterDef, CharacterId, CharacterLook, Hand, QualitySettings, StadiumDef, Vec3 } from '../contracts';
import { MOUND, RUBBER_Z } from '../config/constants';
import { characterById, DEFAULT_CHARACTER } from '../config/characters';
import type { BallView, BatterRig, CatcherRig, Effects, PitcherRig, StadiumView, UmpireRig } from '../render/api';
import { characters, DEFAULT_PITCHER_LOOK } from '../render/characters';
import { createBallView, createEffects, HomeRunThief, Inferno, KippahUfo, PennyView, PitcherBadge } from '../render/fx';
import { sprayOf, standHeight } from '../sim/field';
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
  /** Look the pitcher has without the batter's `pitcherKit` (re-dressed whenever the batter changes). */
  private pitcherBase: { look: CharacterLook; hand: Hand } = { look: DEFAULT_PITCHER_LOOK, hand: 'R' };
  private playersVisible = true;
  private matchActive = false;
  private readonly pitcherBadge = new PitcherBadge();
  /** Benjamin's lucky penny and the flying kippah that answers it. */
  private readonly penny = new PennyView();
  private readonly kippah: KippahUfo;
  /** Chamo's nerf in Southampton: the Slovak mandem and Valentina. */
  private readonly thief: HomeRunThief;
  /** Arturek's curse: the firecracker blast and the park on fire. */
  private readonly inferno: Inferno;
  /** Seconds since the batter was knocked down by the blast (−1 = standing), and his original colours. */
  private batterDown = -1;
  private charred: { m: THREE.MeshStandardMaterial; color: THREE.Color }[] = [];

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
    this.kippah = new KippahUfo(this.quality);
    this.thief = new HomeRunThief(this.quality);
    this.inferno = new Inferno(this.quality);
    this.pitcherBadge.setAnchor(0, MOUND.height, RUBBER_Z);
    this.group.add(this.penny.root, this.kippah.root, this.thief.root, this.inferno.root, this.pitcherBadge.root, this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root, this.ball.root, this.fx.root, this.zone.group);
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
    this.reviveBatter();
    this.characterId = def.id;
    this.dressPitcher();
    this.syncPitcherBadge();
    const old = this.batterRig;
    old.dispose();
    const rig = this.adopt(characters.createBatter(this.quality, def.look));
    this.batterRig = rig;
    rig.root.visible = this.playersVisible;
    this.group.add(rig.root);
    if (this.batColors) rig.setBatColors(this.batColors[0], this.batColors[1]);
    this.setHandedness(this.hand);
  }

  /** Sets the pitcher's own look; the current batter's `pitcherKit` (e.g. Chamo's Southampton shirt) is layered on top. */
  setPitcherLook(look: CharacterLook, hand: Hand): void {
    this.pitcherBase = { look, hand };
    this.dressPitcher();
  }

  /** The crest over the pitcher shows only while a match is on and the batter has one. */
  setMatchActive(v: boolean): void {
    this.matchActive = v;
    this.syncPitcherBadge();
  }

  private syncPitcherBadge(): void {
    const badge = characterById(this.characterId).pitcherBadge;
    if (badge) this.pitcherBadge.setBadge(badge);
    this.pitcherBadge.setVisible(this.matchActive && this.playersVisible && !!badge);
  }

  private dressPitcher(): void {
    const { look, hand } = this.pitcherBase;
    this.pitcher.setLook({ ...look, ...characterById(this.characterId).pitcherKit }, hand);
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
    const roots = [this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root, this.zone.group, this.pitcherBadge.root];
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

  /** Shows Benjamin's penny at a world position, or hides it (null). */
  setPenny(pos: { x: number; y: number; z: number } | null): void {
    if (pos) this.penny.show(pos);
    else this.penny.hide();
  }

  /** The batted ball touched the penny: it spins away. */
  hitPenny(): void {
    this.penny.hit();
  }

  /**
   * The flying kippah lands Netanyahu beside home plate (on the side away
   * from the batter, facing him and the camera, the kippah tilted toward
   * `camera` so its dome shows); `onGive` fires as he blesses.
   */
  playBlessing(camera: { x: number; z: number }, onGive: () => void): void {
    const s = this.hand === 'R' ? 1 : -1;
    this.kippah.play({ x: -s * 1.9, z: 1.1 }, s * 1.05, camera, onGive);
  }

  stopBlessing(): void {
    this.kippah.stop();
  }

  get blessingPlaying(): boolean {
    return this.kippah.playing;
  }

  /** Height of the ground (the outfield stands / hill surface beyond the wall) at a point. */
  groundAt(x: number, z: number): number {
    return standHeight(this.def, sprayOf(x, z), Math.hypot(x, z));
  }

  /** The Slovak mandem waits at `feet` beyond the wall for Chamo's home run. */
  prepareThief(feet: Vec3): void {
    this.thief.prepare(feet, (x, z) => this.groundAt(x, z));
  }

  /** He catches it. */
  thiefCatch(): void {
    this.thief.catchBall();
  }

  /**
   * He runs off with the ball to Valentina. Returns a camera shot framing
   * them from the field side.
   */
  thiefEscape(): { pos: Vec3; look: Vec3 } {
    this.thief.escape();
    const look = this.thief.focus(new THREE.Vector3());
    const out = new THREE.Vector3(look.x, 0, look.z).normalize();
    const pos = new THREE.Vector3(look.x - out.x * 17, look.y + 3.5, look.z - out.z * 17);
    return { pos: { x: pos.x, y: pos.y, z: pos.z }, look: { x: look.x, y: look.y, z: look.z } };
  }

  get thiefPlaying(): boolean {
    return this.thief.playing;
  }

  stopThief(): void {
    this.thief.stop();
  }

  /**
   * The firecracker explodes at `at`: fireball, the batter is blown over and
   * charred, the whole park catches fire and his ghost floats away.
   */
  blowUp(at: Vec3): void {
    const feet = this.batter.root.position;
    this.inferno.blast(at, this.def, { x: feet.x, y: characterById(this.characterId).look.heightM * 0.6, z: feet.z });
    this.knockOutBatter();
  }

  stopInferno(): void {
    this.inferno.stop();
    this.reviveBatter();
  }

  private knockOutBatter(): void {
    if (this.batterDown >= 0) return;
    this.batterDown = 0;
    const seen = new Set<THREE.Material>();
    this.batter.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof THREE.MeshStandardMaterial) || seen.has(m)) continue;
        seen.add(m);
        this.charred.push({ m, color: m.color.clone() });
        m.color.lerp(new THREE.Color('#1a1512'), 0.85);
      }
    });
  }

  private reviveBatter(): void {
    if (this.batterDown < 0) return;
    this.batterDown = -1;
    for (const { m, color } of this.charred) m.color.copy(color);
    this.charred = [];
    this.setHandedness(this.hand);
  }

  /** Characters + ball visible only while batting (hidden on the title orbit). */
  setPlayersVisible(v: boolean): void {
    this.playersVisible = v;
    for (const o of [this.batter.root, this.pitcher.root, this.catcher.root, this.umpire.root]) o.visible = v;
    this.zone.group.visible = v;
    this.syncPitcherBadge();
  }

  update(dt: number, elapsed: number, excitement: number, camera: THREE.Camera): void {
    this.stadium.update(dt, elapsed, excitement);
    this.batter.update(dt);
    if (this.batterDown >= 0) {
      // Blown flat on his back, away from the plate.
      this.batterDown += dt;
      const k = Math.min(1, this.batterDown / 0.7);
      const fall = k * k * (Math.PI / 2) * 0.96;
      const side = this.hand === 'R' ? 1 : -1;
      this.batter.root.rotation.set(0, -side * (Math.PI / 2), 0);
      this.batter.root.rotateX(-fall);
    }
    this.pitcher.update(dt);
    this.catcher.update(dt);
    this.umpire.update(dt);
    this.ball.update(dt);
    this.fx.update(dt, camera);
    this.zone.update(dt);
    this.pitcherBadge.update(elapsed);
    this.penny.update(dt);
    this.kippah.update(dt);
    this.thief.update(dt);
    this.inferno.update(dt);
  }

  dispose(): void {
    this.renderer.scene.remove(this.group);
    this.stadium.dispose();
    this.zone.dispose();
    this.pitcherBadge.dispose();
    this.penny.dispose();
    this.kippah.dispose();
    this.thief.dispose();
    this.inferno.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
  }
}
