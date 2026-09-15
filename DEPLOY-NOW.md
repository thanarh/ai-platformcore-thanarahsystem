# نشر Thanarah AI الآن على Render

## قبل البدء

غيّر كلمة مرور مستخدم MongoDB الذي تم إرسال رابط الاتصال الخاص به في المحادثة. استخدم رابط الاتصال الجديد فقط كقيمة سرية داخل Render.

## الخطوات

1. ارفع المشروع إلى GitHub، وتأكد من عدم رفع `.env`.
2. افتح Render واختر **New → Blueprint**.
3. اربط مستودع GitHub واختر `render.yaml`. إذا كنت أنشأت Web Service يدوياً، غيّر **Build Command** إلى `bash render-build.sh`، وليس `npm install; npm run build`، وغيّر **Start Command** إلى `bash render-start.sh`.
4. عند طلب المتغيرات السرية، أضف:

```env
MONGODB_URI=<رابط MongoDB الجديد بعد تغيير كلمة المرور>
```

5. اترك الإعدادات التالية كما هي في البداية:

```env
LOCAL_AI_ENABLED=false
FREE_PROVIDER_ONLY=true
FREE_PROVIDERS_ENABLED=false
ALLOW_EXTERNAL_PROVIDERS=false
```

6. نفّذ النشر وانتظر نجاح `render-build.sh`.
7. اختبر:

```text
https://YOUR-RENDER-DOMAIN/
https://YOUR-RENDER-DOMAIN/api/health
https://YOUR-RENDER-DOMAIN/api/health/ai
```

## إذا ظهر خطأ `pydantic-core` أو `tiktoken`

هذا يحدث عندما تختار Render Python 3.14 وتحاول بناء إصدارات قديمة من هذه الحزم من المصدر. يحتوي المشروع الآن على `.python-version` و`PYTHON_VERSION=3.12.8` حتى يستخدم Render عجلات Python الجاهزة بدلاً من Cargo/Rust. بعد سحب آخر commit، أعد النشر باستخدام **Clear build cache & deploy**.

## إذا ظهر الخطأ `nest: not found`

هذا يعني أن Render بنى المشروع الجذر فقط ولم يثبت `apps/api/node_modules`. استخدم Build Command التالي:

```bash
bash render-build.sh
```

السكريبت يثبت اعتماديات `apps/web` و`apps/api` بملفات القفل، ثم يبني API والواجهة، ويثبت اعتماديات Python الخفيفة. تم اختبار السكريبت محلياً بنجاح.

## تفعيل مزود مجاني اختيارياً

بعد نجاح النشر الأساسي، يمكن إضافة `GROQ_API_KEY` أو `OPENROUTER_API_KEY` في Render ثم تفعيل:

```env
FREE_PROVIDERS_ENABLED=true
```

لا تغيّر `FREE_PROVIDER_ONLY=true`. هذا يمنع OpenAI وAnthropic من العمل حتى لو أضيفت مفاتيحهما بالخطأ.

## ملاحظة تشغيلية

Render Free مناسب للتجربة والمشاريع الصغيرة، وقد يوقف الخدمة بعد فترة من عدم النشاط. كما أن نظام ملفات الخدمة مؤقت، ولذلك يجب أن تبقى البيانات في MongoDB وليس في ملفات محلية داخل Render.
