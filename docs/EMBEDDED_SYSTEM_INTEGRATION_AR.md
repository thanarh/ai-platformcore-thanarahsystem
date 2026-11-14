# ربط نظام ثنارة AI داخل أنظمة الشركاء

يضمّن هذا النوع واجهات المؤسسة الحالية داخل iframe، ولا ينسخ التطبيق ولا يمنح
الشريك وصولًا إلى لوحة الإدارة العامة. ينشئ مدير المؤسسة الربط من
**الإعدادات → ربط نظام ثنارة AI**. يُحفظ المفتاح الخادمي ببصمة فقط ويظهر مرة
واحدة عند الإنشاء أو التدوير.

## تسلسل التهيئة

1. يسجل خادم الشريك الدخول ويتحقق من المستخدم وفق نظامه هو. يستخرج معرّفًا
   ثابتًا لا يحتوي هاتفًا أو بريدًا، ويستخدم نطاق الشريك المسجل حرفيًا.
2. يطلب الخادم رمزًا أحادي الاستخدام عبر
   `POST /api/embedded/{integrationId}/bootstrap`، مع المفتاح في
   `x-thanarah-integration-key`. لا يضع المفتاح في تطبيق المتصفح أو السجلات.
   الرمز صالح لدقيقة، مربوط بالمستخدم والنطاق وnonce، ويُخزن مخزونًا فقط.
3. يفتح الخادم iframe على `framePath`. بعد تحميل الإطار يرسل إليه `code`
   و`nonce` فقط عبر `postMessage` إلى **أصل ثنارة الدقيق**؛ لا يضعهما في الرابط.
   يستبدل الإطار الرمز بجلسة قصيرة، ولا يعيد رمز المستخدم إلى النافذة الأم.
4. إذا كان هذا المستخدم قد ربط هويته المتحققة سابقًا، يفتح له الحساب ومؤسسته
   نفسها. أول مرة يطلب الإطار تحقق الجوال، ثم يستكمل تفاصيل الحساب عند الحاجة.
   يربط الخادم هوية الشريك الثابتة بالهاتف المتحقق والمؤسسة في معاملة ذرية.

مثال لخادم الشريك (Node.js). اجعل هذا المسار يتطلب جلسة الشريك ويُشتق منه
`verifiedPartnerSession.subject` على الخادم، ولا تقبل `externalUserId` من
الطلب نفسه:

```js
app.post("/integrations/thanarah/bootstrap", requirePartnerLogin, async (req, res) => {
  const result = await fetch(
    `${process.env.THANARAH_URL}/api/embedded/${process.env.THANARAH_INTEGRATION_ID}/bootstrap`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-thanarah-integration-key": process.env.THANARAH_EMBED_KEY,
      },
      body: JSON.stringify({
        externalUserId: req.partnerUser.subject, // trusted server-side identity
        origin: "https://portal.example.com",    // fixed configured site origin
      }),
    },
  );
  if (!result.ok) return res.status(502).json({ error: "embed_unavailable" });
  res.set("Cache-Control", "no-store").json(await result.json());
});
```

مثال صفحة الشريك؛ اطلب التهيئة من المسار الآمن أعلاه بعد التحقق من الدخول.
استبدل `FRAMEWORK_APP_ORIGIN` بأصل ثنارة الحقيقي الذي يظهر في `framePath`:

```js
const response = await fetch("/integrations/thanarah/bootstrap", {
  method: "POST",
  headers: { "content-type": "application/json" },
});
if (!response.ok) throw new Error("تعذر فتح ثنارة");
const bootstrap = await response.json();
const frame = document.querySelector("#thanarah-frame");
frame.src = FRAMEWORK_APP_ORIGIN + bootstrap.framePath;
const thanarahOrigin = new URL(frame.src).origin;
window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== thanarahOrigin) return;
  if (event.data?.type !== "thanarah:ready"
      || event.data.integrationId !== INTEGRATION_ID) return;
  frame.contentWindow.postMessage({
    type: "thanarah:bootstrap",
    integrationId: INTEGRATION_ID,
    code: bootstrap.code,
    nonce: bootstrap.nonce,
  }, thanarahOrigin);
}, { once: false });
```

```html
<iframe id="thanarah-frame" title="ثنارة AI"
  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
  referrerpolicy="strict-origin"
  style="width:100%;min-height:800px;border:0"></iframe>
```

يعاد طلب رمز جديد بعد كل إعادة تحميل أو تسجيل خروج. لا يُكتب المفتاح أو الرمز
أو توكن الجلسة إلى سجل، أو URL، أو `localStorage`، أو رسالة إلى نطاق آخر.
الـ bootstrap code أحادي الاستخدام فقط؛ access token صالح خمس دقائق،
والتحديث أحادي الاستخدام، والجلسة القصوى ثماني ساعات. يتصل WebSocket
بقسيمة أحادية الاستخدام قصيرة بدل تمرير access token في عنوان الاتصال.
تستخدم الواجهة `sessionStorage` مقسّمًا حسب معرّف الربط، ولا تعتمد على cookies
أو `localStorage` للطرف الثالث.

## السياسات والميزات

- يرفض النظام أي أصل لم يُضف حرفيًا إلى قائمة HTTPS، ويصدر سياسة
  `frame-ancestors` لذلك الأصل وحده؛ لا يُفتح الإطار لكل المواقع.
- تغيير النطاق، تدوير المفتاح، أو إيقاف الربط ينهي الجلسات القائمة.
- مفتاح الربط ليس جلسة مستخدم ولا مفتاح WhatsApp API. الربط لا يسمح بقراءة
  بيانات مؤسسات أخرى أو تعديل إدارة المنصة.
- تُحوّل صلاحيات ADMIN/OWNER العامة إلى صلاحية إدارة المؤسسة فقط داخل الإطار.
  تُرفض مسارات الإدارة العامة في الخادم، حتى لو بقي المسار ظاهرًا في المتصفح.
- يحصل كل هاتف جديد على مؤسسة مستقلة مرة واحدة؛ يُستخدم الربط الثابت نفسه
  عند فتح الإطار لاحقًا، ولا يعاد إنشاء مؤسسات على كل دخول.
- يعيد الإطار استخدام صفحات المؤسسة الحالية، بما فيها المعرفة والمحادثات
  ومفاتيح المؤسسة وإعدادات وربط WhatsApp. يبقى QR داخل واجهة ثنارة فقط،
  ولكل مؤسسة جلسة Baileys وموافقات مستقلة. رقم المنصة مخصص لـ OTP.
- سجّل الدخول عبر الجوال المتحقق؛ رقم أو بريد أو اسم خارجي وحده لا يربط حسابًا.
- الجلسة المحلية أحادية النسخة للتشغيل الحالي؛ لا تشغل عدة نسخ Baileys
  متنافسة على جلسة المؤسسة نفسها.

## التحقق

```bash
npm run build --prefix apps/api
node --test tests/regression/embedded_integration.test.cjs
EMBEDDED_MONGO_TEST=1 node --test --test-force-exit tests/regression/embedded_mongo.test.cjs
EMBED_BROWSER_TEST=1 EMBED_TEST_BASE_URL=https://YOUR-REPLIT-DEV-DOMAIN \
  npx playwright test --config=playwright.config.cjs --grep cross-origin
```

اختبار المتصفح الاختياري يضيف سجل تكامل عشوائيًا مؤقتًا إلى قاعدة التطوير
ويحذفه في `finally`. لا يمسح قاعدة التطبيق. لا يرسل الاختبار رسائل WhatsApp
فعلية؛ يلزم جهاز/رقم مرتبط منفصل لفحص QR وإرسال حقيقي.
