'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, Save } from 'lucide-react';
import api from '@/lib/api';

type Scope = 'tenant' | 'platform';

type Settings = {
  forwardingPhones: string[];
  forwardIncomingEnabled: boolean;
  autoReplyEnabled: boolean;
};

const defaults: Settings = {
  forwardingPhones: [],
  forwardIncomingEnabled: false,
  autoReplyEnabled: true,
};

export default function WhatsappAutomationSettings({
  scope,
  title,
}: {
  scope: Scope;
  title: string;
}) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [phonesText, setPhonesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const basePath = scope === 'platform' ? '/admin/whatsapp/platform/settings' : '/whatsapp/settings';

  useEffect(() => {
    let active = true;
    api.get<Settings>(basePath)
      .then(({ data }) => {
        if (!active) return;
        const next = {
          forwardingPhones: Array.isArray(data.forwardingPhones) ? data.forwardingPhones : [],
          forwardIncomingEnabled: data.forwardIncomingEnabled === true,
          autoReplyEnabled: data.autoReplyEnabled === true,
        };
        setSettings(next);
        setPhonesText(next.forwardingPhones.join('\n'));
      })
      .catch((requestError: any) => {
        if (active) setError(requestError?.response?.data?.message || 'تعذّر تحميل إعدادات التوجيه.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [basePath]);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    const forwardingPhones = [...new Set(phonesText
      .split(/[\n,;]+/)
      .map((phone) => phone.trim())
      .filter(Boolean))];
    if (forwardingPhones.length > 10) {
      setError('يمكنك إضافة 10 أرقام كحد أقصى.');
      setSaving(false);
      return;
    }
    try {
      const { data } = await api.put<Settings>(basePath, { ...settings, forwardingPhones });
      setSettings(data);
      setPhonesText(data.forwardingPhones.join('\n'));
      setSaved(true);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'تعذّر حفظ الإعدادات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] p-5 shadow-[0_10px_30px_rgba(29,66,51,.04)] sm:p-6">
      <div>
        <p className="text-[11px] font-bold tracking-[.16em] text-[#6d8b79]">التوجيه والرد الآلي</p>
        <h2 className="mt-2 text-lg font-bold">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65756b]">
          الرد الآلي على الرسائل الواردة مفعّل افتراضيًا، ويمكنك إيقافه. أضف أرقام فريقك وفعّل التوجيه إذا أردت وصول نسخة من الرسائل إليهم. رسائل المجموعات لا تُحوّل.
        </p>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[#65756b]" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> جارٍ تحميل الإعدادات…
        </div>
      ) : (
        <>
          <label className="mt-5 block text-sm font-semibold text-[#33483c]" htmlFor={`whatsapp-forward-phones-${scope}`}>
            أرقام المسؤولين لاستقبال الرسائل
          </label>
          <textarea
            id={`whatsapp-forward-phones-${scope}`}
            value={phonesText}
            onChange={(event) => setPhonesText(event.target.value)}
            placeholder={'+9665XXXXXXXX\n+9665XXXXXXXX'}
            dir="ltr"
            rows={3}
            maxLength={220}
            className="mt-2 w-full rounded-xl border border-[#d8e1d8] bg-white px-3 py-3 text-sm text-[#263b31] outline-none focus:border-[#39785a] focus:ring-2 focus:ring-[#39785a]/15"
          />
          <p className="mt-1 text-xs leading-5 text-[#718078]">رقم دولي يبدأ بـ +، رقم واحد في كل سطر، حتى 10 أرقام.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e5ebe4] bg-[#f6f8f3] p-3">
              <input
                type="checkbox"
                checked={settings.forwardIncomingEnabled}
                onChange={(event) => setSettings((current) => ({ ...current, forwardIncomingEnabled: event.target.checked }))}
                className="mt-1 accent-[#1c5944]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#33483c]">تحويل كل الرسائل الواردة</span>
                <span className="mt-1 block text-xs leading-5 text-[#718078]">يصل للمسؤول إشعار برقم المرسل ثم الرسالة الأصلية أو المرفق.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e5ebe4] bg-[#f6f8f3] p-3">
              <input
                type="checkbox"
                checked={settings.autoReplyEnabled}
                onChange={(event) => setSettings((current) => ({ ...current, autoReplyEnabled: event.target.checked }))}
                className="mt-1 accent-[#1c5944]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#33483c]">الرد الآلي على النصوص</span>
                <span className="mt-1 block text-xs leading-5 text-[#718078]">يجيب على الرسالة المباشرة الواردة؛ «إلغاء» أو STOP يوقف الردود لهذا الرقم.</span>
              </span>
            </label>
          </div>

          <p className="mt-4 rounded-xl border border-[#eadfbd] bg-[#fff9e9] px-3 py-2 text-xs leading-6 text-[#776538]">
            قد تتضمن الرسائل معلومات شخصية أو صحية. أضف أرقام المسؤولين المخولين فقط، وأبلغ المتواصلين بأن فريقك قد يطّلع على رسائلهم. لا يرسل النظام رسائل متابعة من تلقاء نفسه.
          </p>

          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[#9a4636]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-[#34704d]">
              <CheckCircle2 className="h-4 w-4" /> حُفظت الإعدادات.
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1c5944] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'جارٍ الحفظ…' : 'حفظ إعدادات التوجيه'}
          </button>
        </>
      )}
    </section>
  );
}
