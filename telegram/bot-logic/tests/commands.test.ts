import { parseCommand } from '../src/domain/commands';

describe('parseCommand', () => {
  it('parses command with query', () => {
    const cmd = parseCommand('/login?type=github');
    expect(cmd.name).toBe('login');
    expect(cmd.params.type).toBe('github');
  });

  it('parses command with args', () => {
    const cmd = parseCommand('/logout all=true');
    expect(cmd.name).toBe('logout');
    expect(cmd.args).toContain('all=true');
  });

  it('handles plain text', () => {
    const cmd = parseCommand('hello');
    expect(cmd.name).toBe('text');
    expect(cmd.args[0]).toBe('hello');
  });
});
