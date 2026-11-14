const { test, expect } = require('@playwright/test');
const baseURL = process.env.PHONE_TEST_BASE_URL || 'http://127.0.0.1:5000';

test.use({ viewport: { width: 390, height: 844 } });

async function mockPhoneEndpoints(page) {
  const calls = [];
  let attempts = 0;
  await page.route('**/api/auth/phone/**', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ url: route.request().url(), body });
    if (route.request().url().endsWith('/request-code')) {
      return route.fulfill({ json: { success: true, expiresInSeconds: 300, retryAfterSeconds: 1 } });
    }
    if (route.request().url().endsWith('/verify-code')) {
      if (body.code !== '123456') {
        return route.fulfill({ status: 401, json: { message: 'رمز التحقق غير صحيح.' } });
      }
      return route.fulfill({ json: {
        next: 'complete_registration', enrollmentToken: 'p'.repeat(43),
        phone: body.phone, expiresInSeconds: 600,
      } });
    }
    if (route.request().url().endsWith('/complete-registration')) {
      attempts++;
      return route.fulfill({ status: attempts === 1 ? 409 : 503, json: {
        message: attempts === 1 ? 'هذا البريد مسجل بالفعل.' : 'تعذر الاتصال بالخادم. حاول مجددًا.',
      } });
    }
  });
  return calls;
}

test('New mobile user sees only phone first, independent verification, then account fields without losing the proof', async ({ page }) => {
  const calls = await mockPhoneEndpoints(page);
  await page.goto(`${baseURL}/register`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('الاسم الأول', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('البريد الإلكتروني', { exact: true })).toHaveCount(0);
  await page.getByLabel('رقم الجوال', { exact: true }).fill('0501234567');
  await page.getByRole('button', { name: 'إرسال رمز WhatsApp', exact: true }).click();
  expect(calls[0].body).toEqual({ phone: '+966501234567', country: 'SA', purpose: 'register' });
  await expect(page.getByLabel('الاسم الأول', { exact: true })).toHaveCount(0);
  await page.getByLabel('رمز التحقق', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'تأكيد الرمز والمتابعة' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'غير صحيح' })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('رمز التحقق', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'تأكيد الرمز والمتابعة' }).click();
  await expect(page.getByLabel('الاسم الأول', { exact: true })).toBeVisible();
  await expect(page.getByLabel('رقم الجوال', { exact: true })).toHaveCount(0);
  await page.getByLabel('الاسم الأول', { exact: true }).fill('اختبار');
  await page.getByLabel('اسم العائلة', { exact: true }).fill('النظام');
  await page.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'البريد مسجل' })).toBeVisible();
  await expect(page.getByLabel('الاسم الأول', { exact: true })).toHaveValue('اختبار');
  await page.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر الاتصال' })).toBeVisible();
  const completions = calls.filter((call) => call.url.endsWith('/complete-registration'));
  expect(completions).toHaveLength(2);
  expect(completions[0].body.enrollmentToken).toBe(completions[1].body.enrollmentToken);
  expect(completions[0].body.phone).toBeUndefined();
  expect(completions[0].body.email).toBeUndefined();
  expect(completions[0].body.password).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'استخدام رقم جوال آخر' }).click();
  await expect(page.getByLabel('الاسم الأول', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('رقم الجوال', { exact: true })).toBeVisible();
});

test('Country search distinguishes shared calling codes, resend and changing numbers work on login', async ({ page }) => {
  const calls = await mockPhoneEndpoints(page);
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/الدولة:/).click();
  await page.getByPlaceholder('ابحث عن الدولة أو رمز الاتصال').fill('Canada');
  await page.getByRole('button', { name: /كندا CA/ }).click();
  await page.getByLabel('رقم الجوال', { exact: true }).fill('4165550123');
  await page.getByRole('button', { name: 'إرسال رمز WhatsApp', exact: true }).click();
  expect(calls[0].body.phone).toBe('+14165550123');
  expect(calls[0].body.country).toBe('CA');
  await page.getByRole('button', { name: 'إعادة إرسال الرمز', exact: true }).click();
  await expect.poll(() => calls.filter((call) => call.url.endsWith('/request-code')).length).toBe(2);
  await page.getByRole('button', { name: 'تغيير رقم الجوال', exact: true }).click();
  await expect(page.getByLabel('رقم الجوال', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'البريد وكلمة المرور', exact: true }).click();
  await expect(page.getByLabel('البريد الإلكتروني', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الدخول برقم الجوال', exact: true }).click();
  await expect(page.getByLabel('رقم الجوال', { exact: true })).toHaveValue('4165550123');
});
