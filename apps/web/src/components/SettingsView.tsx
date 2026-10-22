import { useRef, useState } from 'react';

import type { ExerciseMedia } from '@spotter/shared';

import { ConfirmDialog } from './ConfirmDialog.js';
import type { Theme } from '../theme.js';
import type { MeasurementSystem } from '../measurement-system.js';

interface SettingsViewProps {
  online: boolean;
  theme: Theme;
  measurementSystem: MeasurementSystem;
  stretchingPoster: ExerciseMedia | null;
  onToggleTheme: () => void;
  onChangeMeasurementSystem: (system: MeasurementSystem) => void;
  onChangeStretchingPoster: (file: File | null) => Promise<void>;
}

export function SettingsView({
  online,
  theme,
  measurementSystem,
  stretchingPoster,
  onToggleTheme,
  onChangeMeasurementSystem,
  onChangeStretchingPoster,
}: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [savingPoster, setSavingPoster] = useState(false);
  const [removePosterOpen, setRemovePosterOpen] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  function savePoster(file: File | null) {
    setSavingPoster(true);
    setPosterError(null);
    void onChangeStretchingPoster(file)
      .catch((error: unknown) =>
        setPosterError(
          error instanceof Error
            ? error.message
            : 'The stretching poster could not be saved.',
        ),
      )
      .finally(() => setSavingPoster(false));
  }

  function handlePosterFile(file?: File) {
    if (!file) return;
    const allowedTypes = ['image/gif', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      setPosterError('Choose a GIF, PNG, or JPEG image.');
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setPosterError('The image must be smaller than 5 MB.');
      return;
    }
    savePoster(file);
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h2>Settings</h2>
        </div>
      </div>
      <article className="card settings-card">
        <div>
          <h3>Appearance</h3>
          <p>Choose the light or dark theme for this device.</p>
        </div>
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={onToggleTheme}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </article>
      <article className="card settings-card">
        <div>
          <h3>Measurement system</h3>
          <p>Choose the weight and distance units used on this device.</p>
        </div>
        <label className="settings-select">
          <span className="sr-only">Measurement system</span>
          <select
            value={measurementSystem}
            onChange={(event) =>
              onChangeMeasurementSystem(event.target.value as MeasurementSystem)
            }
          >
            <option value="metric">Metric (kg, km)</option>
            <option value="imperial">Imperial (lb, mi)</option>
          </select>
        </label>
      </article>
      <article className="card settings-card settings-stretching-card">
        <div className="stretching-setting-content">
          <h3>Stretching poster</h3>
          <p>
            Upload one image to display on the Stretching page from Today. Image
            changes need a connection; a saved image can be viewed offline once
            it has loaded on this device.
          </p>
          {stretchingPoster && (
            <div className="stretching-poster-preview">
              <img src={stretchingPoster.url} alt="Current stretching poster" />
              <button
                className="exercise-image-remove"
                type="button"
                aria-label="Remove stretching poster"
                disabled={!online || savingPoster}
                onClick={() => setRemovePosterOpen(true)}
              >
                ×
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/gif,image/png,image/jpeg,.gif,.png,.jpg,.jpeg"
            aria-label="Choose a stretching poster image"
            disabled={!online || savingPoster}
            onChange={(event) => {
              handlePosterFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            className={`exercise-image-dropzone${dragActive ? ' is-dragging' : ''}`}
            type="button"
            disabled={!online || savingPoster}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handlePosterFile(event.dataTransfer.files[0]);
            }}
          >
            <span>
              {savingPoster
                ? 'Saving stretching poster…'
                : stretchingPoster
                  ? 'Drop an image here or click to replace it'
                  : 'Drop an image here or click to choose a file'}
            </span>
            <small>GIF, PNG, or JPEG · Maximum 5 MB</small>
          </button>
          {!online && (
            <p className="stretching-poster-offline" role="status">
              Connect to upload, replace, or remove the poster.
            </p>
          )}
          {posterError && (
            <p className="stretching-poster-error" role="alert">
              {posterError}
            </p>
          )}
        </div>
        {removePosterOpen && stretchingPoster && (
          <ConfirmDialog
            title="Remove stretching poster?"
            message="This removes the poster for all devices."
            confirmLabel="Remove poster"
            onCancel={() => setRemovePosterOpen(false)}
            onConfirm={() => {
              setRemovePosterOpen(false);
              savePoster(null);
            }}
          />
        )}
      </article>
    </section>
  );
}
