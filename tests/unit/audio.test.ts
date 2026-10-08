import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../src/audio/AudioEngine';

describe('audio engine', () => {
  it('degrades to safe no-ops without Web Audio (tests, old browsers)', async () => {
    const a = createAudioEngine();
    await a.unlock();
    expect(a.unlocked).toBe(false);
    expect(() => {
      a.setVolumes({ master: 1, sfx: 1, music: 1, crowd: 1 });
      a.setSuspended(true);
      a.batCrack(1, 1);
      a.batCrack(0.2, 0.3);
      a.swingWhoosh(true);
      a.mittPop();
      a.thud(0.5);
      a.setCrowdLevel(0.8);
      a.crowdReaction('roar');
      a.crowdReaction('ooh');
      a.fireworks(3);
      a.organCharge();
      a.homeRunJingle();
      a.stageEnd(true);
      a.uiClick();
      a.uiHover();
      a.scheduleTick(0, true);
    }).not.toThrow();
    expect(a.now()).toBe(0);
    expect(a.outputLatency()).toBe(0);
  });
});
