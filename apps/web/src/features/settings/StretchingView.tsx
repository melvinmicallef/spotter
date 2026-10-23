import type { ExerciseMedia } from '@spotter/shared';

interface StretchingViewProps {
  poster: ExerciseMedia | null;
  onBack: () => void;
  onOpenSettings: () => void;
}

export function StretchingView({
  poster,
  onBack,
  onOpenSettings,
}: StretchingViewProps) {
  return (
    <section className="stretching-page">
      <button
        className="text-button stretching-back-button"
        type="button"
        onClick={onBack}
      >
        ← Today
      </button>
      {poster ? (
        <div className="stretching-poster-frame">
          <img src={poster.url} alt="Stretching poster" />
        </div>
      ) : (
        <div className="stretching-empty-state">
          <h2>Stretching poster</h2>
          <p>Upload a stretching image in Settings to see it here.</p>
          <button className="secondary" type="button" onClick={onOpenSettings}>
            Open settings
          </button>
        </div>
      )}
    </section>
  );
}
