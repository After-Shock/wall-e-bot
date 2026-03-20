const NESTED_QUANTIFIER_PATTERN = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
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

  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
