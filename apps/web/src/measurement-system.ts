import type { DistanceUnit as SharedDistanceUnit } from '@spotter/shared';

export type DistanceUnit = SharedDistanceUnit;
export type WeightUnit = 'kg' | 'lb';

export type MeasurementSystem = 'metric' | 'imperial';

export const MEASUREMENT_SYSTEM_STORAGE_KEY = 'spotter-measurement-system';
const LEGACY_WEIGHT_UNIT_STORAGE_KEY = 'spotter-weight-unit';

export function initialMeasurementSystem(): MeasurementSystem {
  const savedSystem = localStorage.getItem(MEASUREMENT_SYSTEM_STORAGE_KEY);
  if (savedSystem === 'imperial') return 'imperial';
  if (savedSystem === 'metric') return 'metric';

  // Keep an existing pounds preference when upgrading from the weight-only setting.
  return localStorage.getItem(LEGACY_WEIGHT_UNIT_STORAGE_KEY) === 'lb'
    ? 'imperial'
    : 'metric';
}

export function applyMeasurementSystem(system: MeasurementSystem) {
  localStorage.setItem(MEASUREMENT_SYSTEM_STORAGE_KEY, system);
}

export function weightUnitFor(system: MeasurementSystem): WeightUnit {
  return system === 'imperial' ? 'lb' : 'kg';
}

export function distanceUnitFor(system: MeasurementSystem): DistanceUnit {
  return system === 'imperial' ? 'mi' : 'km';
}

export function convertWeight(
  value: number | null,
  from: WeightUnit,
  to: WeightUnit,
): number | null {
  if (value == null || from === to) return value;
  const converted = to === 'lb' ? value * 2.20462262185 : value / 2.20462262185;
  return Number(converted.toFixed(2));
}

export function convertDistance(
  value: number | null,
  from: DistanceUnit,
  to: DistanceUnit,
): number | null {
  if (value == null || from === to) return value;
  const converted =
    to === 'mi' ? value * 0.62137119223733 : value / 0.62137119223733;
  return Number(converted.toFixed(2));
}
