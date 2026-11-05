import type { Lang } from '../contracts';
import { AdPolicy, type BreakPlacement, type RewardPlacement } from './policy';

export { AdPolicy, POLICY } from './policy';
export type { BreakPlacement, RewardPlacement } from './policy';

/**
 * Ads (docs/adr/ADR-009-anuncios.md). One small interface over the web-game
 * ad networks, chosen at build time (VITE_ADS) or by host:
 *
 *  - `none`        no ads at all (default for self-hosted builds without a client id)
 *  - `dev`         a fake, clearly-labelled test ad (local development, `?ads=dev`)
 *  - `h5`          Google AdSense H5 Games Ads (Ad Placement API: adBreak/adConfig)
 *  - `poki`        Poki SDK (commercialBreak / rewardedBreak)
 *  - `crazygames`  CrazyGames SDK v3 (requestAd midgame / rewarded)
 *
 * SDK scripts are injected at runtime only for the chosen provider, so the
 * default build makes no third-party requests. The game mutes and freezes
 * input while an ad plays (onAdStart / onAdEnd).
 */
export type AdProviderId = 'none' | 'dev' | 'h5' | 'poki' | 'crazygames';

/** A rewarded ad that is ready: `show()` resolves true when the reward is earned. */
export interface RewardOffer {
  show(): Promise<boolean>;
}

export interface AdHooks {
  onAdStart(): void;
  onAdEnd(): void;
}

interface Provider {
  init(): Promise<void>;
  /** Null when no rewarded ad can be shown right now. */
  offerReward(name: string): Promise<RewardOffer | null>;
  showBreak(name: string): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingFinished(): void;
}

export class AdService {
  readonly provider: AdProviderId;
  readonly policy: AdPolicy;
  private readonly impl: Provider;
  private ready: Promise<void>;
  private playing = false;
  private hooks: AdHooks = { onAdStart: () => {}, onAdEnd: () => {} };

  constructor(provider: AdProviderId, impl: Provider, policy = new AdPolicy()) {
    this.provider = provider;
    this.impl = impl;
    this.policy = policy;
    this.ready = impl.init().catch(() => undefined);
  }

  setHooks(h: AdHooks): void {
    this.hooks = h;
  }

  /** Whether this build can ever show a rewarded ad (hides the buttons otherwise). */
  get enabled(): boolean {
    return this.provider !== 'none';
  }

  /** Offers a rewarded ad for `placement` if the policy and the network allow it. */
  async offerReward(placement: RewardPlacement): Promise<RewardOffer | null> {
    if (!this.enabled || !this.policy.canOfferReward(placement)) return null;
    await this.ready;
    const offer = await this.impl.offerReward(placement).catch(() => null);
    if (!offer) return null;
    return {
      show: async () => {
        this.hooks.onAdStart();
        this.impl.gameplayStop();
        try {
          const ok = await offer.show();
          this.policy.rewardShown(placement);
          return ok;
        } catch {
          return false;
        } finally {
          this.hooks.onAdEnd();
        }
      },
    };
  }

  /** Natural break between matches; resolves when the game can go on (ad or not). */
  async naturalBreak(placement: BreakPlacement, adsRemoved: boolean): Promise<void> {
    if (!this.enabled || !this.policy.canBreak(placement, adsRemoved)) return;
    await this.ready;
    this.policy.breakShown();
    this.hooks.onAdStart();
    try {
      await this.impl.showBreak(placement);
    } catch {
      /* no fill / blocked: just continue */
    } finally {
      this.hooks.onAdEnd();
    }
  }

  matchStarted(): void {
    this.policy.matchStarted();
  }

  matchFinished(): void {
    this.policy.matchFinished();
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.impl.gameplayStart();
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.impl.gameplayStop();
  }

  loadingFinished(): void {
    void this.ready.then(() => this.impl.loadingFinished());
  }
}

// ───────────────────────────── Providers ─────────────────────────────

const noop = (): void => {};

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`ads: failed to load ${src}`));
    document.head.append(s);
  });
}

const none: Provider = {
  init: async () => {},
  offerReward: async () => null,
  showBreak: async () => {},
  gameplayStart: noop,
  gameplayStop: noop,
  loadingFinished: noop,
};

/** A clearly fake ad for development and QA (never shipped by default). */
function devProvider(lang: () => Lang): Provider {
  const show = (kind: 'reward' | 'break'): Promise<boolean> =>
    new Promise((resolve) => {
      const es = lang() === 'es';
      const wrap = document.createElement('div');
      wrap.className = 'ad-dev';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      const box = document.createElement('div');
      box.className = 'ad-dev-box';
      const title = document.createElement('b');
      title.textContent = es ? 'ANUNCIO DE PRUEBA' : 'TEST AD';
      const p = document.createElement('p');
      p.textContent = es ? 'Aquí iría un anuncio real (Google H5, Poki o CrazyGames).' : 'A real ad would play here (Google H5, Poki or CrazyGames).';
      const count = document.createElement('div');
      count.className = 'ad-dev-count';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.disabled = true;
      const skip = document.createElement('button');
      skip.className = 'btn btn-ghost';
      skip.textContent = es ? 'Cerrar sin recompensa' : 'Close without reward';
      box.append(title, p, count, btn);
      if (kind === 'reward') box.append(skip);
      wrap.append(box);
      document.body.append(wrap);
      let left = kind === 'reward' ? 3 : 2;
      const tick = (): void => {
        count.textContent = String(left);
        btn.textContent = left > 0 ? (es ? 'Espera…' : 'Wait…') : kind === 'reward' ? (es ? 'Recoger recompensa' : 'Claim reward') : es ? 'Continuar' : 'Continue';
        btn.disabled = left > 0;
      };
      tick();
      const timer = window.setInterval(() => {
        left--;
        tick();
        if (left <= 0) {
          window.clearInterval(timer);
          btn.focus();
        }
      }, 1000);
      const done = (ok: boolean): void => {
        window.clearInterval(timer);
        wrap.remove();
        resolve(ok);
      };
      btn.addEventListener('click', () => done(true));
      skip.addEventListener('click', () => done(false));
    });
  return {
    init: async () => {},
    offerReward: async () => ({ show: () => show('reward') }),
    showBreak: async () => {
      await show('break');
    },
    gameplayStart: noop,
    gameplayStop: noop,
    loadingFinished: noop,
  };
}

interface H5Break {
  type: string;
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: { breakStatus?: string }) => void;
}

type H5Window = Window & { adsbygoogle?: unknown[]; adBreak?: (o: H5Break) => void; adConfig?: (o: Record<string, unknown>) => void };

/** Google AdSense H5 Games Ads (Ad Placement API). */
function h5Provider(client: string, test: boolean, sound: () => boolean): Provider {
  const w = window as H5Window;
  const push = (o: object): void => {
    w.adsbygoogle = w.adsbygoogle || [];
    w.adsbygoogle.push(o);
  };
  return {
    init: async () => {
      w.adBreak = w.adConfig = (o: object) => push(o);
      const attrs: Record<string, string> = { 'data-ad-client': client, crossorigin: 'anonymous' };
      if (test) attrs['data-adbreak-test'] = 'on';
      await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`, attrs);
      w.adConfig!({ preloadAdBreaks: 'on', sound: sound() ? 'on' : 'off' });
    },
    offerReward: (name) =>
      new Promise((resolve) => {
        let settled = false;
        let viewed = false;
        let finish: ((ok: boolean) => void) | null = null;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 1500);
        w.adBreak!({
          type: 'reward',
          name,
          beforeReward: (showAdFn) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            resolve({
              show: () =>
                new Promise<boolean>((done) => {
                  finish = done;
                  showAdFn();
                }),
            });
          },
          adViewed: () => (viewed = true),
          adDismissed: () => (viewed = false),
          adBreakDone: () => {
            window.clearTimeout(timeout);
            if (!settled) {
              settled = true;
              resolve(null);
            }
            finish?.(viewed);
          },
        });
      }),
    showBreak: (name) =>
      new Promise((resolve) => {
        w.adBreak!({ type: 'next', name, adBreakDone: () => resolve() });
      }),
    gameplayStart: noop,
    gameplayStop: noop,
    loadingFinished: noop,
  };
}

interface PokiSDK {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(before?: () => void): Promise<void>;
  rewardedBreak(before?: () => void): Promise<boolean>;
}

function pokiProvider(): Provider {
  const sdk = (): PokiSDK | undefined => (window as Window & { PokiSDK?: PokiSDK }).PokiSDK;
  return {
    init: async () => {
      await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      await sdk()?.init();
    },
    offerReward: async () => (sdk() ? { show: () => sdk()!.rewardedBreak() } : null),
    showBreak: async () => {
      await sdk()?.commercialBreak();
    },
    gameplayStart: () => sdk()?.gameplayStart(),
    gameplayStop: () => sdk()?.gameplayStop(),
    loadingFinished: () => sdk()?.gameLoadingFinished(),
  };
}

interface CrazySDK {
  init(): Promise<void>;
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void };
  game: { gameplayStart(): void; gameplayStop(): void; loadingStop(): void };
}

function crazyProvider(): Provider {
  const sdk = (): CrazySDK | undefined => (window as Window & { CrazyGames?: { SDK: CrazySDK } }).CrazyGames?.SDK;
  const request = (type: 'midgame' | 'rewarded'): Promise<boolean> =>
    new Promise((resolve) => {
      const s = sdk();
      if (!s) return resolve(false);
      s.ad.requestAd(type, { adFinished: () => resolve(true), adError: () => resolve(false) });
    });
  return {
    init: async () => {
      await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
      await sdk()?.init();
    },
    offerReward: async () => (sdk() ? { show: () => request('rewarded') } : null),
    showBreak: async () => {
      await request('midgame');
    },
    gameplayStart: () => sdk()?.game.gameplayStart(),
    gameplayStop: () => sdk()?.game.gameplayStop(),
    loadingFinished: () => sdk()?.game.loadingStop(),
  };
}

/** Which provider this build/host uses. URL `?ads=dev|none` overrides (QA). */
export function resolveProvider(env: { mode?: string; dev: boolean; client?: string }, host: string, search: string): AdProviderId {
  const q = new URLSearchParams(search).get('ads');
  if (q === 'dev' || q === 'none') return q;
  const mode = (env.mode ?? (env.dev ? 'dev' : 'auto')).toLowerCase();
  if (mode === 'none' || mode === 'dev' || mode === 'h5' || mode === 'poki' || mode === 'crazygames') {
    if (mode === 'h5' && !env.client) return 'none';
    return mode;
  }
  // auto: by host
  if (/(^|\.)poki(-gdn)?\.(com|io)$/.test(host) || host.endsWith('.poki.com')) return 'poki';
  if (/(^|\.)crazygames\.(com|[a-z.]+)$/.test(host)) return 'crazygames';
  return env.client ? 'h5' : 'none';
}

export function createAdService(opts: { lang: () => Lang; sound: () => boolean }): AdService {
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  const client = typeof env.VITE_ADSENSE_CLIENT === 'string' && env.VITE_ADSENSE_CLIENT ? env.VITE_ADSENSE_CLIENT : undefined;
  const provider = resolveProvider({ mode: typeof env.VITE_ADS === 'string' ? env.VITE_ADS : undefined, dev: !!env.DEV, client }, location.hostname, location.search);
  const test = env.VITE_ADS_TEST === 'on' || env.VITE_ADS_TEST === 'true';
  const impl =
    provider === 'dev' ? devProvider(opts.lang) : provider === 'h5' ? h5Provider(client!, test, opts.sound) : provider === 'poki' ? pokiProvider() : provider === 'crazygames' ? crazyProvider() : none;
  return new AdService(provider, impl);
}
