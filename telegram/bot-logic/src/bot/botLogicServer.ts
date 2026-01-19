import http from 'http';
import { config } from '../config';
import { logger } from '../logger';
import { createAuthClient } from '../integrations/authClient';
import { createMainClient } from '../integrations/mainClient';
import { StateStore } from '../integrations/stateStore';
import { handleAuthCheck, handleNotifications, handleUpdate } from './handlers';

const readJson = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });

export const startBotLogicServer = (store: StateStore): http.Server => {
  const authClient = createAuthClient();
  const mainClient = createMainClient();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/telegram/update') {
        const body = await readJson(req);
        const response = await handleUpdate(body as any, store, authClient, mainClient);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/telegram/cron/auth-check') {
        const body = (await readJson(req)) as { limit?: number };
        const limit = body?.limit || 100;
        const response = await handleAuthCheck(store, authClient, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: response }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/telegram/cron/notifications') {
        const body = (await readJson(req)) as { limit?: number };
        const limit = body?.limit || 100;
        const response = await handleNotifications(store, authClient, mainClient, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: response }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      logger.error({ error }, 'BotLogic error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  });

  server.listen(config.botLogicPort, () => {
    logger.info(`Bot Logic listening on port ${config.botLogicPort}`);
  });

  return server;
};
