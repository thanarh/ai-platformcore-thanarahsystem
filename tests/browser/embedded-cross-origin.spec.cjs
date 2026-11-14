const { test, expect } = require('@playwright/test');
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('../../apps/api/node_modules/mongoose');
const { EmbeddedIntegrationSchema } = require('../../apps/api/dist/modules/embedded/schemas/embedded.schema');
const API_BASE = process.env.NEXT_API_URL || 'http://127.0.0.1:3001';
const APP_BASE = process.env.EMBED_TEST_BASE_URL;
const enabled = process.env.EMBED_BROWSER_TEST === '1' && Boolean(APP_BASE && process.env.MONGODB_URI);

async function hostServer(html) {
  let content = html;
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(content);
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}`, setHtml(value) { content = value; } };
}

test('A different-origin host receives a framed tenant page with restricted origins', {
  skip: !enabled,
  timeout: 60_000,
}, async ({ page }) => {
  const appOrigin = new URL(APP_BASE).origin;
  const db = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName: 'thanarah_ai', serverSelectionTimeoutMS: 15_000,
  });
  let host, integrationId;
  try {
    await db.asPromise();
    console.log('[embed-test] connected to fixture database');
    const integrations = db.model('EmbeddedIntegration', EmbeddedIntegrationSchema.clone());
    const hostOriginProbe = await hostServer('<!doctype html>');
    host = hostOriginProbe;
    const id = new mongoose.Types.ObjectId();
    integrationId = id;
    const integrationKey = `thn_embed_${randomBytes(32).toString('base64url')}`;
    await integrations.create({
      _id: id, tenantId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(),
      name: 'Cross-origin browser fixture', type: 'thanarah_embed',
      allowedOrigins: [host.origin],
      keyHash: createHash('sha256').update(integrationKey).digest('hex'),
      keyPrefix: `${integrationKey.slice(0, 18)}…`,
    });
    console.log('[embed-test] created temporary integration');
    const bootstrapResponse = await fetch(`${API_BASE}/api/embedded/${id}/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-thanarah-integration-key': integrationKey },
      body: JSON.stringify({ externalUserId: `fixture-${randomBytes(12).toString('hex')}`, origin: host.origin }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!bootstrapResponse.ok) throw new Error('Server-side bootstrap request failed.');
    const bootstrap = await bootstrapResponse.json();
    console.log('[embed-test] received a one-use bootstrap');
    const frameUrl = new URL(bootstrap.framePath, APP_BASE).toString();
    if (frameUrl.includes(bootstrap.code) || frameUrl.includes(integrationKey)) {
      throw new Error('A long-lived or one-time key appeared in an iframe URL.');
    }
    const payload = JSON.stringify({
      type: 'thanarah:bootstrap', integrationId: id.toString(),
      code: bootstrap.code, nonce: bootstrap.nonce,
    }).replace(/</g, '\\u003c');
    host.setHtml(`<!doctype html><html><body>
      <iframe title="Thanarah fixture" src="${frameUrl}"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
        referrerpolicy="strict-origin" style="width:100%;height:850px;border:0"></iframe>
      <script>
        const frame = document.querySelector('iframe');
        const thanarahOrigin = ${JSON.stringify(appOrigin)};
        const bootstrap = ${payload};
        window.addEventListener('message', (event) => {
          if (event.source === frame.contentWindow && event.origin === thanarahOrigin
              && event.data?.type === 'thanarah:ready'
              && event.data.integrationId === bootstrap.integrationId) {
            frame.contentWindow.postMessage(bootstrap, thanarahOrigin);
          }
        });
      </script></body></html>`);
    await page.route(`**/api/embedded/${id}/exchange`, (route) => route.fulfill({
      json: { next: 'verify_phone', onboardingToken: `thc_${'o'.repeat(43)}`, expiresInSeconds: 900 },
    }));
    page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on('pageerror', (error) => console.log(`[browser:error] ${error.message}`));
    page.on('requestfailed', (request) => console.log(`[request-failed] ${request.url()} ${request.failure()?.errorText}`));
    page.on('framenavigated', (frame) => console.log(`[frame] ${frame.url()}`));
    console.log('[embed-test] opening the partner host');
    const embeddedDocument = page.waitForResponse((response) =>
      response.url().includes(`/embed/${id}`) && response.request().resourceType() === 'document',
      { timeout: 15_000 },
    );
    const exchangeRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/embedded/${id}/exchange`),
      { timeout: 15_000 },
    );
    await page.goto(host.origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('[embed-test] partner host opened');
    const frameResponse = await embeddedDocument;
    console.log(`[embed-test] embedded document status: ${frameResponse.status()}`);
    const exchange = await exchangeRequest;
    expect(exchange.method()).toBe('POST');
    expect(JSON.parse(exchange.postData() || '{}')).toMatchObject({ code: bootstrap.code, nonce: bootstrap.nonce });
    expect(frameResponse.url()).toContain(`/embed/${id}`);
    expect(frameResponse.url()).not.toContain(bootstrap.code);
    expect(frameResponse.url()).not.toContain(integrationKey);
    const embeddedHeaders = frameResponse.headers();
    expect(embeddedHeaders['content-security-policy']).toContain(`frame-ancestors 'self' ${host.origin}`);
    expect(embeddedHeaders['x-frame-options']).toBeUndefined();

  } finally {
    host?.server.closeAllConnections();
    await Promise.race([
      page.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    await new Promise((resolve) => host?.server.close(resolve));
    try {
      if (integrationId && db.readyState === 1) {
        await db.collection('embeddedintegrations').deleteOne({ _id: integrationId });
        await db.collection('embeddedbootstraps').deleteMany({ integrationId });
        await db.collection('embeddedidentities').deleteMany({ integrationId });
        await db.collection('embeddedsessions').deleteMany({ integrationId });
      }
    } finally { await db.close(); }
  }
});
