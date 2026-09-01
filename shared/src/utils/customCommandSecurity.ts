// A quantified group containing an inner quantifier: (a+)+
const NESTED_QUANTIFIER_PATTERN = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
// A quantified group containing alternation: (a|a)*, (a|ab)+ — the classic
// exponential-backtracking shape, and the one the original check missed.
// Deliberately over-broad: it also rejects unambiguous patterns like (cat|dog)+.
// Over-rejecting a working pattern is the safe direction for a guard whose
// failure mode is hanging the event loop for every guild.
const ALTERNATION_QUANTIFIER_PATTERN = /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[+*{]/;
const BACKREFERENCE_PATTERN = /\\[1-9]/;
const MAX_REGEX_LENGTH = 200;

export function canExecuteCustomCommand(input: {
  allowedChannels?: string[] | null;
  allowedRoles?: string[] | null;
  channelId: string;
  memberRoleIds: string[];
}): boolean {
  const allowedChannels = input.allowedChannels ?? [];
  const allowedRoles = input.allowedRoles ?? [];

  if (allowedChannels.length > 0 && !allowedChannels.includes(input.channelId)) {
    return false;
  }

  if (allowedRoles.length > 0 && !input.memberRoleIds.some((roleId) => allowedRoles.includes(roleId))) {
    return false;
  }

  return true;
}

/**
 * Reject regex patterns whose backtracking can blow up.
 *
 * This is a HEURISTIC, not a guarantee — a blocklist cannot enumerate every
 * catastrophic pattern. It covers the shapes that actually show up (nested
 * quantifiers, quantified alternation, backreferences) and bounds length.
 *
 * The real fix, when regex triggers are actually used, is a linear-time engine
 * (re2) or matching in a worker with a hard timeout: JavaScript's RegExp has no
 * way to abort a running match, so a single bad pattern stalls the event loop
 * for every guild the process serves. Currently zero commands use trigger_type
 * 'regex', which is why that dependency has not been taken on yet.
 */
export function isSafeCustomCommandRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) {
    return false;
  }

  if (BACKREFERENCE_PATTERN.test(pattern)) {
    return false;
  }

  if (NESTED_QUANTIFIER_PATTERN.test(pattern)) {
    return false;
  }

  if (ALTERNATION_QUANTIFIER_PATTERN.test(pattern)) {
    return false;
  }

  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
