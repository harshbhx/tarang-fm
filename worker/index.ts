import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true, sarvamKey: Boolean(c.env.SARVAM_API_KEY) }));

export default app;
