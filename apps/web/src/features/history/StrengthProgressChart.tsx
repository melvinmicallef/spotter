import type { Exercise, Workout } from '@spotter/shared';

import { convertWeight } from '../settings/measurement-system.js';
import type { WeightUnit } from '../settings/measurement-system.js';

interface ProgressPoint {
  startedAt: string;
  estimatedOneRepMax: number;
  trainingVolume: number;
}

export function StrengthProgressChart({
  exercise,
  workouts,
  weightUnit,
}: {
  exercise: Exercise;
  workouts: Workout[];
  weightUnit: WeightUnit;
}) {
  if (exercise.exerciseType !== 'strength') return null;
  const points = progressForExercise(exercise.id, workouts, weightUnit);

  return (
    <section className="strength-progress">
      <div>
        <span className="eyebrow">PERFORMANCE</span>
        <h2>{exercise.name} progress</h2>
        <p>
          Estimated 1RM uses Epley&apos;s formula. Training volume is weight ×
          repetitions summed across each workout.
        </p>
      </div>
      {points.length === 0 ? (
        <p className="empty-state">
          Log weighted sets with repetitions to build a progress graph.
        </p>
      ) : (
        <div className="strength-progress-grid">
          <MetricChart
            title={`Estimated 1RM (${weightUnit})`}
            unit={weightUnit}
            points={points}
            valueFor={(point) => point.estimatedOneRepMax}
          />
          <MetricChart
            title={`Training volume (${weightUnit} × reps)`}
            unit={`${weightUnit} × reps`}
            points={points}
            valueFor={(point) => point.trainingVolume}
          />
        </div>
      )}
    </section>
  );
}

function MetricChart({
  title,
  unit,
  points,
  valueFor,
}: {
  title: string;
  unit: string;
  points: ProgressPoint[];
  valueFor: (point: ProgressPoint) => number;
}) {
  const values = points.map(valueFor);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = Math.max((dataMax - dataMin) * 0.15, dataMax * 0.08, 1);
  const min = Math.max(0, dataMin - padding);
  const max = dataMax + padding;
  const left = 64;
  const right = 584;
  const top = 20;
  const bottom = 174;
  const x = (index: number) =>
    points.length === 1
      ? (left + right) / 2
      : left + (index / (points.length - 1)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - min) / (max - min)) * (bottom - top);
  const coordinates = points
    .map((point, index) => `${x(index)},${y(valueFor(point))}`)
    .join(' ');
  const usesYear =
    new Set(points.map((point) => new Date(point.startedAt).getFullYear()))
      .size > 1;
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(
      undefined,
      usesYear
        ? { month: 'short', day: 'numeric', year: '2-digit' }
        : { month: 'short', day: 'numeric' },
    ).format(new Date(value));
  const labelIndexes = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];

  return (
    <article className="strength-progress-chart">
      <h3>{title}</h3>
      <svg
        viewBox="0 0 620 220"
        role="img"
        aria-label={`${title} over time, measured in ${unit}`}
      >
        {[0, 0.5, 1].map((fraction) => {
          const lineY = bottom - fraction * (bottom - top);
          const value = min + fraction * (max - min);
          return (
            <g key={fraction}>
              <line
                className="progress-grid-line"
                x1={left}
                x2={right}
                y1={lineY}
                y2={lineY}
              />
              <text
                className="progress-axis-label"
                textAnchor="end"
                x={left - 8}
                y={lineY + 4}
              >
                {formatMetric(value)}
              </text>
            </g>
          );
        })}
        {points.length > 1 && (
          <polyline className="progress-line" points={coordinates} />
        )}
        {points.map((point, index) => (
          <circle
            className="progress-point"
            key={`${point.startedAt}-${index}`}
            cx={x(index)}
            cy={y(valueFor(point))}
            r="4"
          >
            <title>
              {dateLabel(point.startedAt)} · {formatMetric(valueFor(point))}{' '}
              {unit}
            </title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text
            className="progress-date-label"
            key={index}
            textAnchor={
              index === 0
                ? 'start'
                : index === points.length - 1
                  ? 'end'
                  : 'middle'
            }
            x={x(index)}
            y={bottom + 24}
          >
            {dateLabel(points[index]!.startedAt)}
          </text>
        ))}
      </svg>
      <p className="progress-latest-value">
        Latest: {formatMetric(values.at(-1)!)} {unit}
      </p>
    </article>
  );
}

function progressForExercise(
  exerciseId: string,
  workouts: Workout[],
  weightUnit: WeightUnit,
): ProgressPoint[] {
  return [...workouts]
    .filter((workout) => workout.status === 'completed')
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .flatMap((workout) => {
      const matchingEntries = workout.exercises.filter(
        (entry) =>
          entry.exerciseId === exerciseId && entry.exerciseType === 'strength',
      );
      const estimatedMaxes: number[] = [];
      let trainingVolume = 0;

      for (const entry of matchingEntries) {
        for (const set of entry.sets) {
          if (
            set.weight == null ||
            set.weight <= 0 ||
            set.reps == null ||
            set.reps <= 0
          )
            continue;
          const weight = convertWeight(set.weight, set.weightUnit, weightUnit)!;
          estimatedMaxes.push(weight * (1 + set.reps / 30));
          trainingVolume += weight * set.reps;
        }
      }

      if (estimatedMaxes.length === 0) return [];
      return [
        {
          startedAt: workout.startedAt,
          estimatedOneRepMax: Math.max(...estimatedMaxes),
          trainingVolume,
        },
      ];
    });
}

function formatMetric(value: number) {
  return Number(value.toFixed(1)).toLocaleString();
}
