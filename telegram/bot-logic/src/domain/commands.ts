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

const tokenizeCommand = (input: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '\\' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

export const parseCommand = (text: string): Command => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { name: 'text', params: {}, args: [trimmed], raw: trimmed };
  }

  const [first, ...rest] = tokenizeCommand(trimmed);
  const withoutSlash = first.slice(1);
  const [namePartRaw, queryPart] = withoutSlash.split('?', 2);
  const [namePart] = namePartRaw.split('@', 2);

  return {
    name: namePart.toLowerCase(),
    params: parseParams(queryPart || ''),
    args: rest,
    raw: trimmed
  };
};
