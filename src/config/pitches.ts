import type { PitchTypeDef, PitchTypeId, PitcherDef } from '../contracts';

/**
 * Pitch movement is expressed as whole-flight break relative to a spinless,
 * gravity-only path (design numbers inspired by public Statcast profiles,
 * scaled for full flight). Values are for a right-handed pitcher; the sim
 * mirrors horizontal break for lefties.
 */
export const PITCH_TYPES: Record<PitchTypeId, PitchTypeDef> = {
  FF: { id: 'FF', name: { es: 'Recta de 4 costuras', en: 'Four-seam fastball' }, speedMph: [92, 97], ivbIn: 19, hbIn: 9, spinRpm: 2300, chaseLow: 0.15, color: '#e63946' },
  SI: { id: 'SI', name: { es: 'Sinker', en: 'Sinker' }, speedMph: [91, 95], ivbIn: 9, hbIn: 18, spinRpm: 2150, chaseLow: 0.6, color: '#f4a261' },
  FC: { id: 'FC', name: { es: 'Cutter', en: 'Cutter' }, speedMph: [87, 91], ivbIn: 11, hbIn: -5, spinRpm: 2400, chaseLow: 0.4, color: '#e9c46a' },
  SL: { id: 'SL', name: { es: 'Slider', en: 'Slider' }, speedMph: [83, 88], ivbIn: 2, hbIn: -11, spinRpm: 2450, chaseLow: 0.7, color: '#2a9d8f' },
  ST: { id: 'ST', name: { es: 'Sweeper', en: 'Sweeper' }, speedMph: [80, 85], ivbIn: 1, hbIn: -20, spinRpm: 2650, chaseLow: 0.5, color: '#3a86ff' },
  CU: { id: 'CU', name: { es: 'Curva', en: 'Curveball' }, speedMph: [76, 81], ivbIn: -16, hbIn: -9, spinRpm: 2700, chaseLow: 0.85, color: '#8338ec' },
  CH: { id: 'CH', name: { es: 'Cambio', en: 'Changeup' }, speedMph: [82, 87], ivbIn: 8, hbIn: 16, spinRpm: 1750, chaseLow: 0.8, color: '#06d6a0' },
  FS: { id: 'FS', name: { es: 'Splitter', en: 'Splitter' }, speedMph: [84, 89], ivbIn: 2, hbIn: 10, spinRpm: 1400, chaseLow: 0.9, color: '#ff006e' },
};

export const PITCHERS: Record<string, PitcherDef> = {
  ramon: {
    id: 'ramon',
    name: 'Ramón Tavárez',
    nickname: { es: 'Tío Ramón', en: 'Uncle Ramón' },
    hand: 'R',
    arsenal: [
      { type: 'FF', weight: 3, speedOffset: -24 },
      { type: 'CH', weight: 1, speedOffset: -21 },
    ],
    command: 0.75,
    zoneRate: 0.85,
    tempo: 1.1,
    look: { skin: '#c68c5a', jersey: '#f1faee', jerseyTrim: '#e63946', pants: '#d9d9d9', cap: '#e63946', build: 1.12 },
  },
  brisa: {
    id: 'brisa',
    name: 'Iván Soler',
    nickname: { es: 'La Brisa', en: 'The Breeze' },
    hand: 'R',
    arsenal: [
      { type: 'FF', weight: 3, speedOffset: -7 },
      { type: 'SI', weight: 2, speedOffset: -6 },
      { type: 'CH', weight: 2, speedOffset: -4 },
    ],
    command: 0.7,
    zoneRate: 0.75,
    tempo: 1.0,
    look: { skin: '#8d5524', jersey: '#0f4c5c', jerseyTrim: '#fb8b24', pants: '#f1faee', cap: '#0f4c5c', build: 1.0 },
  },
  mago: {
    id: 'mago',
    name: 'Leo Castañeda',
    nickname: { es: 'El Mago', en: 'The Wizard' },
    hand: 'L',
    arsenal: [
      { type: 'FF', weight: 3, speedOffset: -3 },
      { type: 'SL', weight: 2, speedOffset: -1 },
      { type: 'CU', weight: 2, speedOffset: -2 },
      { type: 'CH', weight: 1, speedOffset: -1 },
    ],
    command: 0.72,
    zoneRate: 0.68,
    tempo: 0.95,
    look: { skin: '#f1c27d', jersey: '#14213d', jerseyTrim: '#fca311', pants: '#e5e5e5', cap: '#14213d', build: 0.98 },
  },
  condor: {
    id: 'condor',
    name: 'Andrés Quispe',
    nickname: { es: 'El Cóndor', en: 'The Condor' },
    hand: 'R',
    arsenal: [
      { type: 'FF', weight: 3, speedOffset: 0 },
      { type: 'FC', weight: 2, speedOffset: 0 },
      { type: 'ST', weight: 2, speedOffset: 0 },
      { type: 'FS', weight: 2, speedOffset: 0 },
    ],
    command: 0.78,
    zoneRate: 0.64,
    tempo: 0.9,
    look: { skin: '#a5694f', jersey: '#2b2d42', jerseyTrim: '#8ecae6', pants: '#edf2f4', cap: '#2b2d42', build: 1.05 },
  },
  ciclon: {
    id: 'ciclon',
    name: 'Rafael Montes',
    nickname: { es: 'El Ciclón', en: 'The Cyclone' },
    hand: 'R',
    arsenal: [
      { type: 'FF', weight: 4, speedOffset: 4 },
      { type: 'SI', weight: 2, speedOffset: 3 },
      { type: 'SL', weight: 2, speedOffset: 3 },
      { type: 'CU', weight: 1, speedOffset: 3 },
      { type: 'FS', weight: 2, speedOffset: 3 },
    ],
    command: 0.82,
    zoneRate: 0.6,
    tempo: 0.85,
    look: { skin: '#6f4e37', jersey: '#240046', jerseyTrim: '#ffd60a', pants: '#f8f9fa', cap: '#240046', build: 1.1 },
  },
  machine: {
    id: 'machine',
    name: 'Práctica',
    nickname: { es: 'Lanzador de práctica', en: 'Practice pitcher' },
    hand: 'R',
    arsenal: [{ type: 'FF', weight: 1, speedOffset: -10 }],
    command: 0.9,
    zoneRate: 0.9,
    tempo: 0.8,
    look: { skin: '#c68c5a', jersey: '#495057', jerseyTrim: '#adb5bd', pants: '#dee2e6', cap: '#212529', build: 1.0 },
  },
};
