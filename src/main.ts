import { App } from './game/App';

/** Bootstrap: one App instance bound to the canvas and the UI root. */
const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const ui = document.getElementById('ui');
if (!canvas || !ui) throw new Error('JONRÓN: missing #scene or #ui');

const app = new App(canvas, ui);
app.start();

// Exposed for automated smoke tests and debugging.
(window as unknown as { __jonron?: App }).__jonron = app;
