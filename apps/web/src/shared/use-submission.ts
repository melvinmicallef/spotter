import { useRef, useState } from 'react';

export function useSubmission() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  async function submit(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { pending, submit };
}
