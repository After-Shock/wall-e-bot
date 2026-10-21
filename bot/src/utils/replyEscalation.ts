const HOUR = 60 * 60 * 1000;

// ponytail: fixed ladder for every escalating command; make it per-command config if a server needs other steps
const STEPS = [
  { ms: HOUR, label: '1 hour' },
  { ms: 24 * HOUR, label: '1 day' },
  { ms: 7 * 24 * HOUR, label: '1 week' },
];

/** Timeout for a user's Nth active offense: 1 hour, 1 day, then 1 week (and a manual-action alert) from the 3rd on. */
export function escalationFor(activeCount: number): { ms: number; label: string; needsManualAction: boolean } {
  const step = Math.min(Math.max(activeCount, 1), STEPS.length) - 1;
  return { ...STEPS[step], needsManualAction: step === STEPS.length - 1 };
}
