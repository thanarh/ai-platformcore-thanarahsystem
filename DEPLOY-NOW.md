# نشر Thanarah AI الآن على Render

## قبل البدء

غيّر كلمة مرور مستخدم MongoDB الذي تم إرسال رابط الاتصال الخاص به في المحادثة. استخدم رابط الاتصال الجديد فقط كقيمة سرية داخل Render.

## الخطوات

1. ارفع المشروع إلى GitHub، وتأكد من عدم رفع `.env`.
2. افتح Render واختر **New → Blueprint**.
3. اربط مستودع GitHub واختر `render.yaml`. إذا كنت أنشأت Web Service يدوياً، غيّر **Build Command** إلى `bash render-build.sh`، وليس `npm install; npm run build`، وغيّر **Start Command** إلى `bash render-start.sh`.
4. خطة التشغيل المعتمدة للتوليد المحلي هي **12 CPU / 24 GB RAM** ومعرّفها في Blueprint هو `12c-24g`.
5. عند طلب المتغيرات السرية، أضف قيماً قوية وغير فارغة:

```env
MONGODB_URI=<رابط MongoDB الجديد بعد تغيير كلمة المرور>
SESSION_SECRET=<نفس القيمة الثابتة المستخدمة عند ربط جلسة WhatsApp>
JWT_SECRET=<قيمة عشوائية طويلة>
JWT_REFRESH_SECRET=<قيمة عشوائية طويلة ومختلفة>
ENCRYPTION_KEY=<قيمة عشوائية طويلة ومختلفة>
```

`SESSION_SECRET` يجب أن يطابق القيمة التي شُفّرت بها جلسة WhatsApp الحالية. لا تولّد قيمة جديدة لها ولا ترسلها في المحادثة؛ أضفها مباشرةً في إعدادات Environment Variables في Render. إذا لم تعد تملك القيمة نفسها، ستحتاج إلى ربط الرقم مجددًا عبر QR بعد إعداد مفتاح ثابت.

6. إذا كانت الخدمة منشأة يدوياً، أضف أو حدّث `SESSION_SECRET` بالقيمة نفسها أعلاه، إضافةً إلى متغيرات التشغيل التالية؛ تعديل `render.yaml` لا يغيّر خدمة يدوية موجودة تلقائياً:

```env
LOCAL_AI_MODE=enabled
LOCAL_AI_REQUIRED=true
LOCAL_AI_MODEL=qwen2.5:7b
LOCAL_AI_KEEP_ALIVE=-1
LOCAL_AI_NUM_CTX=4096
LOCAL_AI_NUM_THREAD=6
LOCAL_AI_NUM_BATCH=128
LOCAL_AI_MAX_TOKENS_FAST=128
LOCAL_AI_MAX_TOKENS_BALANCED=384
LOCAL_AI_MAX_TOKENS_DEEP=768
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_QUEUE=128
LOCAL_AI_QUEUE_TIMEOUT_SECONDS=60
WEB_CONCURRENCY=1
FREE_PROVIDER_ONLY=true
FREE_PROVIDERS_ENABLED=false
ALLOW_EXTERNAL_PROVIDERS=false
EXTERNAL_AI_ENABLED=true
EXTERNAL_AI_API_KEY=<أضفه كسر في Render، ولا تضعه في GitHub>
EXTERNAL_AI_MODEL=gpt-5-nano
EXTERNAL_AI_MAX_TOKENS_FIELD=max_completion_tokens
EXTERNAL_AI_TIMEOUT_SECONDS=8
EXTERNAL_AI_MAX_RETRIES=0
EXTERNAL_AI_DAILY_BUDGET_USD=0.19
EXTERNAL_AI_INPUT_PRICE_PER_MILLION=0.5
EXTERNAL_AI_OUTPUT_PRICE_PER_MILLION=2
```

7. نفّذ **Clear build cache & deploy** بعد سحب أحدث commit. عند أول تشغيل يُنزّل الخادم ملف النموذج (نحو 4.4 GiB) ثم يحمّله إلى الذاكرة قبل إعلان الجاهزية، لذلك قد يستغرق النشر الأول عدة دقائق. النجاح يظهر في السجل هكذا:

```text
[MODEL] Model warmed and ready: qwen2.5:7b
[START] Thanarah advanced generation is ready
[START] All Thanarah services are ready
```

أضف `EXTERNAL_AI_API_KEY` في Render كسرّ من لوحة الخدمة، ولا تضعه في GitHub أو المحادثة. يستخدم Blueprint `gpt-5-nano` بحد يومي قدره **0.19 دولار** لتوليد الإجابات؛ مع احتياطي البحث المعتمد **0.06 دولار** يبقى السقف الإجمالي **0.25 دولار يوميًا**. مفتاح Replit لا ينتقل تلقائيًا إلى Render.

8. اختبر:

```text
https://YOUR-RENDER-DOMAIN/
https://YOUR-RENDER-DOMAIN/api/health
https://YOUR-RENDER-DOMAIN/api/health/ai
```

## حفظ النموذج بين عمليات النشر

نظام الملفات الافتراضي في Render مؤقت. من صفحة الخدمة افتح **Disk** وأضف قرصاً دائماً بهذه القيم:

| الإعداد | القيمة |
| --- | --- |
| Mount path | `/var/data` |
| Size | `10 GB` على الأقل |

سيستخدم `render-start.sh` المسار `/var/data/ollama/models` تلقائياً عند وجود القرص. بدونه سيعمل النظام، لكنه سيعيد تنزيل النموذج بعد إعادة التشغيل أو النشر. وفق [تسعير Render](https://render.com/pricing)، مساحة SSD الدائمة تكلف حالياً **0.25 دولار لكل GB شهرياً**؛ لذلك لم يُفعّل القرص تلقائياً في Blueprint. راجع أيضاً [توثيق الأقراص الرسمي](https://render.com/docs/disks).

## إذا ظهر خطأ `pydantic-core` أو `tiktoken`

هذا يحدث عندما تختار Render Python 3.14 وتحاول بناء إصدارات قديمة من هذه الحزم من المصدر. يحتوي المشروع الآن على `.python-version` و`PYTHON_VERSION=3.12.8` حتى يستخدم Render عجلات Python الجاهزة بدلاً من Cargo/Rust. بعد سحب آخر commit، أعد النشر باستخدام **Clear build cache & deploy**.

## إذا ظهر الخطأ `nest: not found`

هذا يعني أن Render بنى المشروع الجذر فقط ولم يثبت `apps/api/node_modules`. استخدم Build Command التالي:

```bash
bash render-build.sh
```

السكريبت يثبت اعتماديات `apps/web` و`apps/api` بملفات القفل، ثم يبني API والواجهة، ويثبت اعتماديات Python الخفيفة. تم اختبار السكريبت محلياً بنجاح.

## إعداد خدمات الذكاء

تُدار خدمات الذكاء من متغيرات البيئة الخاصة بالخادم. لا تعرض مفاتيح الخدمات في الواجهة، ولا تضفها إلى GitHub، ولا تغيّر إعدادات التشغيل المعتمدة إلا بعد اختبارها في بيئة منفصلة.

بعد استقرار النشر، اجعل مستودع GitHub **خاصاً** إذا كنت لا تريد إتاحة تفاصيل التنفيذ الداخلية للعموم. إخفاء أسماء التقنيات من الواجهة لا يمنع قراءة المصدر في مستودع عام.

## ملاحظة تشغيلية

تعتمد استمرارية الخدمة على موارد خطة الاستضافة المختارة. تُحفظ بيانات المستخدمين والمعرفة في MongoDB، بينما يحتاج ملف النموذج إلى قرص Render الدائم إذا أردت تجنب إعادة تنزيله. التوليد على CPU حقيقي لكنه لن يكون فورياً؛ زمن أول رد أطول بسبب تحميل النموذج، ثم تتحسن الاستجابات اللاحقة.
