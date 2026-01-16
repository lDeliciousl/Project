import { Command } from './types';

const parseParams = (value: string) => {
  const params: Record<string, string> = {};
  if (!value) {
    return params;
  }
  const searchParams = new URLSearchParams(value);
  for (const [key, val] of searchParams.entries()) {
    params[key] = val;
  }
  return params;
};

export const parseCommand = (text: string): Command => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { name: 'text', params: {}, args: [trimmed], raw: trimmed };
  }

  const [first, ...rest] = trimmed.split(/\s+/);
  const withoutSlash = first.slice(1);
  const [namePart, queryPart] = withoutSlash.split('?', 2);

  return {
    name: namePart.toLowerCase(),
    params: parseParams(queryPart || ''),
    args: rest,
    raw: trimmed
  };
};
