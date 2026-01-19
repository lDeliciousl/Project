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

  it('keeps multi-word args for actions', () => {
    const cmd = parseCommand('/user set-name 123 John Doe');
    expect(cmd.name).toBe('user');
    expect(cmd.args[0]).toBe('set-name');
    expect(cmd.args[1]).toBe('123');
    expect(cmd.args.slice(2).join(' ')).toBe('John Doe');
  });

  it('parses action commands without query params', () => {
    const cmd = parseCommand('/course enroll abc-123 user-777');
    expect(cmd.name).toBe('course');
    expect(cmd.params).toEqual({});
    expect(cmd.args).toEqual(['enroll', 'abc-123', 'user-777']);
  });

  it('strips bot name suffix in group commands', () => {
    const cmd = parseCommand('/help@my_bot');
    expect(cmd.name).toBe('help');
    expect(cmd.params).toEqual({});
    expect(cmd.args).toEqual([]);
  });
});
