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

test('A different-origin host can securely bootstrap the full embedded product; unlisted origins cannot frame it', {
  skip: !enabled,
  timeout: 180_000,
}, async ({ page }) => {
  const appOrigin = new URL(APP_BASE).origin;
  const db = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName: 'thanarah_ai', serverSelectionTimeoutMS: 15_000,
  });
  let host, deniedHost, integrationId;
  try {
    await db.asPromise();
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
    const bootstrapResponse = await fetch(`${API_BASE}/api/embedded/${id}/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-thanarah-integration-key': integrationKey },
      body: JSON.stringify({ externalUserId: `fixture-${randomBytes(12).toString('hex')}`, origin: host.origin }),
    });
    if (!bootstrapResponse.ok) throw new Error('Server-side bootstrap request failed.');
    const bootstrap = await bootstrapResponse.json();
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
    // A second random host port is a distinct origin and must be rejected.

    await page.route(`**/api/embedded/${id}/exchange`, (route) => route.fulfill({
      json: { next: 'verify_phone', onboardingToken: `thc_${'o'.repeat(43)}`, expiresInSeconds: 900 },
    }));
    await page.route(`**/api/embedded/${id}/phone/request-code`, (route) => route.fulfill({
      json: { success: true, expiresInSeconds: 300, retryAfterSeconds: 60 },
    }));
    await page.route(`**/api/embedded/${id}/phone/verify-code`, (route) => route.fulfill({
      json: { next: 'complete_registration', phone: '+966501234567', phoneProof: 'p'.repeat(43) },
    }));
    const user = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', firstName: 'Embed', lastName: 'Fixture',
      role: 'TENANT_OWNER', tenantId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      isEmbedded: true, embeddedIntegrationId: id.toString(),
    };
    const tokens = { accessToken: `the_${'a'.repeat(43)}`, refreshToken: `thr_${'b'.repeat(43)}` };
    await page.route(`**/api/embedded/${id}/phone/complete-registration`, (route) => route.fulfill({
      json: { next: 'authenticated', user, ...tokens, expiresInSeconds: 300, embedded: true },
    }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/conversations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/tenants/my/usage', (route) => route.fulfill({ json: {
      plan: 'free', appDailyCoins: 500, appCoinsUsed: 0, appCoinsRemaining: 500,
      apiDailyRequests: 50, apiRequestsUsed: 0, apiRequestsRemaining: 50,
    } }));
    await page.route('**/api/ai/**', (route) => route.fulfill({ json: { available: true, items: [] } }));
    let embeddedHeaders;
    page.on('response', (response) => {
      if (response.url().includes(`/embed/${id}`)) embeddedHeaders = response.headers();
    });
    await page.goto(host.origin, { waitUntil: 'domcontentloaded' });
    const frame = page.frameLocator('iframe[title="Thanarah fixture"]');
    await expect(frame.getByLabel('رقم الجوال', { exact: true })).toBeVisible({ timeout: 60_000 });
    await frame.getByLabel('رقم الجوال', { exact: true }).fill('0501234567');
    await frame.getByRole('button', { name: 'إرسال رمز WhatsApp', exact: true }).click();
    await frame.getByLabel('رمز التحقق', { exact: true }).fill('123456');
    await frame.getByRole('button', { name: 'تحقق', exact: true }).click();
    await frame.getByLabel('الاسم الأول', { exact: true }).fill('اختبار');
    await frame.getByLabel('اسم العائلة', { exact: true }).fill('مضمّن');
    await frame.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
    await expect(frame.getByText('قاعدة المعرفة', { exact: true })).toBeVisible({ timeout: 60_000 });
    const storage = await frame.locator('body').evaluate(() => ({
      authKeys: Object.keys(sessionStorage).filter((key) => key.includes('thanarah-auth')),
      sharedLocalStorage: localStorage.getItem('thanarah-auth'),
      path: window.location.pathname,
    }));
    expect(storage.authKeys.some((key) => key.includes(id.toString()))).toBe(true);
    expect(storage.sharedLocalStorage).toBeNull();
    expect(storage.path).toContain(`/embed/${id}`);
    expect(embeddedHeaders?.['content-security-policy']).toContain(`frame-ancestors 'self' ${host.origin}`);
    expect(embeddedHeaders?.['x-frame-options']).toBeUndefined();

    deniedHost = await hostServer(`<!doctype html><iframe title="Denied" src="${frameUrl.replace(
      encodeURIComponent(host.origin), encodeURIComponent('http://127.0.0.1:1'),
    )}"></iframe>`);
    await page.goto(deniedHost.origin, { waitUntil: 'domcontentloaded' });
    const deniedFrame = page.frameLocator('iframe[title="Denied"]');
    await expect(deniedFrame.locator('body')).toContainText('غير مصرح', { timeout: 30_000 });
  } finally {
    await new Promise((resolve) => host?.server.close(resolve));
    await new Promise((resolve) => deniedHost?.server.close(resolve));
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
