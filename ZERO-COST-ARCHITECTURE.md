# معمارية Thanarah AI المجانية

## الخلاصة

تم تجهيز المشروع ليعمل محلياً أولاً، ويستخدم مزودين خارجيين مجانيين بشكل اختياري ومحدود فقط. لا يوجد مزود API يمكنه ضمان استخدام غير محدود إلى الأبد بلا تكلفة؛ لذلك يعتمد التصميم على أربعة مستويات: التخزين المؤقت، النموذج المحلي عند توفر جهاز مناسب، مزود مجاني بحصص، ثم fallback خفيف.

## ما تم تنفيذه

| المكوّن | الوضع |
|---|---|
| Ollama المحلي | يعمل في التطوير وعلى جهاز يملك RAM كافية، لكنه معطل افتراضياً على Render Free |
| Groq | Adapter متوافق مع OpenAI، اختياري، مع daily/RPM quota داخلية |
| OpenRouter | Adapter متوافق مع OpenAI، اختياري، مع daily/RPM quota داخلية |
| OpenAI/Anthropic | محظوران عندما `FREE_PROVIDER_ONLY=true` حتى لو وُجدت مفاتيح في البيئة |
| Response cache | يجيب الطلبات المتكررة دون استهلاك نموذج |
| Memory/RAG | استرجاع خبرات ومستندات دون تدريب لكل رسالة |
| Render | Blueprint وخطتا build/start لتشغيل الواجهة وAPI ومحرك AI الخفيف في خدمة واحدة |

## إعدادات عدم التكلفة

```env
LOCAL_AI_ENABLED=false
FREE_PROVIDER_ONLY=true
FREE_PROVIDERS_ENABLED=false
ALLOW_EXTERNAL_PROVIDERS=false
```

هذه الإعدادات تشغّل fallback الخفيف فقط على Render. لتفعيل مزود مجاني، أدخل مفتاح Groq أو OpenRouter في Render ثم غيّر `FREE_PROVIDERS_ENABLED=true`. لا تغيّر `FREE_PROVIDER_ONLY` إلى false إذا كان الهدف منع أي استخدام مدفوع.

## Render Free

الملفات الجاهزة هي `render.yaml` و`render-build.sh` و`render-start.sh`. يتم تشغيل Next.js على المنفذ الذي تحدده Render، بينما يعمل NestJS وPython داخلياً على المنافذ 3001 و8000. تم منع Ollama من التشغيل في Render Free حتى لا يحدث تنزيل نموذج كبير أو استهلاك RAM غير مناسب.

يجب استخدام MongoDB خارجي دائم عبر `MONGODB_URI`، لأن نظام ملفات Render المجاني مؤقت. كما يجب توقع توقف الخدمة عند عدم وجود طلبات، وحدود استخدام وحصص متغيرة من Render والمزودين المجانيين.

## أفضل جودة مجانية

لأفضل جودة وسرعة بدون فاتورة، شغّل Ollama على جهازك أو خادم منزلي بذاكرة مناسبة، واستخدم نموذجاً أكبر من `qwen2.5:0.5b`، ثم اجعل Render واجهة وAPI فقط عبر شبكة آمنة. إذا كان المطلوب تشغيل كل شيء داخل Render Free، فالأفضل استخدام مزود مجاني محدود مع cache وresponse profiles قصيرة، مع قبول أن الجودة والحصص لن تكون مضمونة دائماً.

## المراجع

[1]: https://render.com/docs/free "Render Free Services Documentation"
[2]: https://console.groq.com/docs/rate-limits "Groq Rate Limits"
[3]: https://ai.google.dev/gemini-api/docs/rate-limits "Google Gemini API Rate Limits"
