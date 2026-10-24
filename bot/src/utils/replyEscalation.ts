const MINUTE = 60 * 1000;

// ponytail: fixed ladder for every escalating command; make it per-command config if a server needs other steps
const STEPS = [
  { ms: 10 * MINUTE, label: '10 minutes', notice: null },
  { ms: 60 * MINUTE, label: '1 hour', notice: 'This is your second offense.' },
  { ms: 24 * 60 * MINUTE, label: '1 day', notice: 'This is your third offense. Your next offense of any rule will result in a ban.' },
];

/** Timeout for a user's Nth active offense: 10 minutes, 1 hour, then 1 day (and a manual-action alert) from the 3rd on. */
export function escalationFor(activeCount: number): { ms: number; label: string; notice: string | null; needsManualAction: boolean } {
  const step = Math.min(Math.max(activeCount, 1), STEPS.length) - 1;
  return { ...STEPS[step], needsManualAction: step === STEPS.length - 1 };
}
