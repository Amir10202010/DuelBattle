import { afterEach, describe, expect, it, vi } from 'vitest';

/** `config` is read once at import, so each case needs a fresh module. */
async function load() {
  vi.resetModules();
  return (await import('../src/config.js')).config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the port the API listens on', () => {
  it('defaults to 8787', async () => {
    vi.stubEnv('PORT', '');
    vi.stubEnv('SERVER_PORT', '');
    expect((await load()).port).toBe(8787);
  });

  it('follows PORT, which is what a host sets', async () => {
    vi.stubEnv('PORT', '9090');
    vi.stubEnv('SERVER_PORT', '');
    expect((await load()).port).toBe(9090);
  });

  /**
   * `SERVER_PORT` is the address the Vite proxy forwards to and what
   * `.env.example` calls the server's port. While nothing read it, setting a
   * `PORT` anywhere in the environment moved the server and left the proxy
   * pointing at an empty port — from the browser, the API had simply vanished.
   */
  it('lets the development variable keep the server with its proxy', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SERVER_PORT', '9100');
    vi.stubEnv('PORT', '5173');
    expect((await load()).port).toBe(9100);
  });

  /**
   * The other half of that, and the more expensive one to get wrong: a
   * developer's `.env` is loaded in every environment, so a `SERVER_PORT` left
   * in it must not outrank the port the platform assigned. A deploy that binds
   * the wrong port never passes its health check.
   */
  it('ignores the development variable in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SERVER_PORT', '8787');
    vi.stubEnv('PORT', '9899');
    expect((await load()).port).toBe(9899);
  });

  it('refuses a port number that is not one', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SERVER_PORT', '70000');
    vi.stubEnv('PORT', '');
    await expect(load()).rejects.toThrow(/SERVER_PORT/);
  });
});
