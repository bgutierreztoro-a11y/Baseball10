import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/config/campaign';
import {
  SAVE_KEY,
  defaultSave,
  isBatUnlocked,
  isStageUnlocked,
  loadSave,
  migrate,
  nextStageId,
  persistSave,
  recordStage,
  totalStars,
  type KeyValueStore,
} from '../../src/persistence/save';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('save data', () => {
  it('round-trips through storage', () => {
    const store = new MemoryStore();
    const { save } = recordStage(defaultSave(), '1-1', 2, true, 0);
    persistSave(store, save);
    expect(loadSave(store)).toEqual(save);
  });

  it('survives corrupt JSON and garbage values', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store)).toEqual(defaultSave());
    const m = migrate({ settings: { quality: 'ultra', volume: { master: 7 }, latencyMs: 9999 }, stages: { '1-1': { stars: 12 } }, selectedBat: 'nope' });
    expect(m.settings.quality).toBe('auto');
    expect(m.settings.volume.master).toBe(1);
    expect(m.settings.latencyMs).toBe(150);
    expect(m.stages['1-1']!.stars).toBe(3);
    expect(m.selectedBat).toBe('fresno');
  });

  it('works without storage (private mode)', () => {
    expect(loadSave(null)).toEqual(defaultSave());
    expect(persistSave(null, defaultSave())).toBe(false);
  });

  it('unlocks the campaign linearly', () => {
    let save = defaultSave();
    expect(isStageUnlocked(save, '1-1')).toBe(true);
    expect(isStageUnlocked(save, '1-2')).toBe(false);
    save = recordStage(save, '1-1', 1, true, 0).save;
    expect(isStageUnlocked(save, '1-2')).toBe(true);
    expect(nextStageId(save)).toBe('1-2');
  });

  it('keeps the best stars and never removes completion', () => {
    let save = recordStage(defaultSave(), '1-1', 3, true, 300).save;
    save = recordStage(save, '1-1', 1, true, 200).save;
    save = recordStage(save, '1-1', 0, false, 0).save;
    expect(save.stages['1-1']).toEqual({ stars: 3, completed: true, bestLongestFt: 300 });
  });

  it('unlocks bats by total stars', () => {
    let save = defaultSave();
    let unlocked: string[] = [];
    for (const st of STAGES.slice(0, 3)) {
      const r = recordStage(save, st.id, 3, true, 0);
      save = r.save;
      unlocked = unlocked.concat(r.unlockedBats);
    }
    expect(totalStars(save)).toBe(9);
    expect(unlocked).toEqual(['arce']);
    expect(isBatUnlocked(save, 'arce')).toBe(true);
    expect(isBatUnlocked(save, 'neon')).toBe(false);
  });
});
