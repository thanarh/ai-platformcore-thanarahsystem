import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  Check,
  FileText,
  Mic,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  response?: string;
  files?: string[];
  streaming?: boolean;
  time: string;
};

const greeting: ChatMessage = {
  id: 1,
  role: "assistant",
  text: "أهلًا بك. أنا ثنارة، مساعدك للعمل والمعرفة.\n\nاكتب ما تحتاجه، أرفق ملفًا، أو تحدث إليّ — وسأبدأ مباشرة.",
  time: "الآن",
};

const quickPrompts = [
  "لخّص لي خطة هذا الأسبوع",
  "اكتب رسالة متابعة لعميل",
];

function makeReply(prompt: string, files: string[]) {
  const topic = prompt.trim();
  const attachmentLine = files.length
    ? `اطّلعت على ${files.length === 1 ? "الملف المرفق" : "الملفات المرفقة"} وسأضعها في الحسبان. `
    : "";

  if (/اجتماع|موعد|تقويم/.test(topic)) {
    return `${attachmentLine}إليك ملخصًا سريعًا للخطوة التالية:\n\n١. ثبّت موعد الاجتماع مع الفريق.\n٢. أرسل جدول الأعمال قبل الموعد بيوم.\n٣. اختم الاجتماع بالقرارات والمسؤوليات.\n\nإذا شاركتني الموعد أو أسماء الحضور، أجهّز لك رسالة الدعوة الآن.`;
  }

  if (/عميل|رسالة|بريد/.test(topic)) {
    return `${attachmentLine}هذه صياغة مهنية ومختصرة يمكنك إرسالها:\n\nمرحبًا،\nأتابع معك بخصوص ما ناقشناه. يسعدني معرفة رأيك، وأنا جاهز للإجابة عن أي استفسار أو ترتيب الخطوة التالية في الوقت المناسب لك.\n\nتحياتي،\nفريق العمل\n\nيمكنني تعديل النبرة أو إضافة تفاصيل مشروعك متى رغبت.`;
  }

  return `${attachmentLine}وصلتني رسالتك: «${topic || "طلبك"}».\n\nسأبدأ بتقسيمها إلى خطوات واضحة، ثم أرتّب لك خلاصة عملية يمكنك العمل بها فورًا.\n\nهل تفضّل أن أقدّمها كملخص سريع أم كخطة مفصلة؟`;
}

export function InstantReply() {
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(2);
  const streamingText = useRef("");

  useEffect(() => {
    if (streamingId === null) return;
    const response = streamingText.current;
    let cursor = 0;
    const timer = window.setInterval(() => {
      cursor = Math.min(cursor + 3, response.length);
      setMessages((current) =>
        current.map((item) =>
          item.id === streamingId
            ? { ...item, text: response.slice(0, cursor), streaming: cursor < response.length }
            : item,
        ),
      );
      if (cursor >= response.length) {
        window.clearInterval(timer);
        setStreamingId(null);
      }
    }, 42);
    return () => window.clearInterval(timer);
  }, [streamingId]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setTimeout(() => {
      setInput((current) =>
        current ? `${current} أحتاج إلى ملخص واضح للموضوع` : "أحتاج إلى ملخص واضح للموضوع",
      );
      setListening(false);
      setNotice("تم تحويل الصوت إلى نص — راجعه قبل الإرسال.");
      textareaRef.current?.focus();
    }, 2100);
    return () => window.clearTimeout(timer);
  }, [listening]);

  useEffect(() => {
    const region = messagesRef.current;
    if (!region) return;
    const nearBottom = region.scrollHeight - region.scrollTop - region.clientHeight < 120;
    if (nearBottom || streamingId !== null) {
      region.scrollTo({ top: region.scrollHeight, behavior: "smooth" });
      setShowJump(false);
    }
  }, [messages, streamingId]);

  const sendMessage = (override?: string) => {
    const text = (override ?? input).trim();
    if ((!text && attachments.length === 0) || streamingId !== null) return;

    const userId = nextId.current++;
    const assistantId = nextId.current++;
    const fileNames = attachments.map((file) => file.name);
    const reply = makeReply(text || "راجع الملفات المرفقة", fileNames);
    streamingText.current = reply;

    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text, files: fileNames, time: "الآن" },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        response: reply,
        streaming: true,
        time: "الآن",
      },
    ]);
    setInput("");
    setAttachments([]);
    setNotice("");
    setListening(false);
    setStreamingId(assistantId);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const resetConversation = () => {
    setMessages([greeting]);
    setInput("");
    setAttachments([]);
    setStreamingId(null);
    streamingText.current = "";
    setListening(false);
    setNotice("");
    nextId.current = 2;
  };

  const stopStreaming = () => {
    if (streamingId === null) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === streamingId ? { ...message, streaming: false } : message,
      ),
    );
    setStreamingId(null);
    streamingText.current = "";
  };

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length) {
      setAttachments((current) => [...current, ...selected]);
      setNotice(`تمت إضافة ${selected.length} ${selected.length === 1 ? "ملف" : "ملفات"} للمحادثة.`);
    }
    event.target.value = "";
  };

  return (
    <div className="instant-reply" dir="rtl">
      <style>{styles}</style>
      <div className="ir-frame">
        <header className="ir-header">
          <div className="ir-brand">
            <span className="ir-brand-mark" aria-hidden="true"><Sparkles size={18} /></span>
            <span className="ir-brand-name">ثنارة <b>AI</b></span>
            <span className="ir-online"><i /> متاحة الآن</span>
          </div>
          <button className="ir-new-chat" onClick={resetConversation} type="button">
            <Plus size={15} />
            <span>محادثة جديدة</span>
          </button>
        </header>

        <main className="ir-main">
          <div
            className="ir-messages"
            ref={messagesRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              setShowJump(element.scrollHeight - element.scrollTop - element.clientHeight > 180);
            }}
            aria-label="رسائل المحادثة"
          >
            <div className="ir-date"><span>اليوم</span></div>
            <div className="ir-thread">
              {messages.map((message) => (
                <article
                  className={`ir-message ir-${message.role}`}
                  key={message.id}
                  aria-label={message.role === "assistant" ? "رد ثنارة" : "رسالتك"}
                >
                  {message.role === "assistant" && (
                    <span className="ir-avatar" aria-hidden="true"><Sparkles size={15} /></span>
                  )}
                  <div className="ir-message-content">
                    <div className="ir-message-meta">
                      <strong>{message.role === "assistant" ? "ثنارة" : "أنت"}</strong>
                      <time>{message.time}</time>
                    </div>
                    <div className="ir-bubble">
                      {message.files?.map((file) => (
                        <span className="ir-file-in-message" key={file}>
                          <FileText size={14} />
                          <span>{file}</span>
                        </span>
                      ))}
                      {message.text && <p>{message.text}</p>}
                      {message.streaming && (
                        <span className="ir-cursor" aria-hidden="true" />
                      )}
                      {message.streaming && !message.text && (
                        <span className="ir-thinking" aria-label="ثنارة تكتب الآن">
                          <i /><i /><i />
                          <span>أفكّر في أفضل إجابة</span>
                        </span>
                      )}
                    </div>
                    {message.streaming && (
                      <span className="ir-stream-label" role="status">
                        <span className="ir-live-dot" /> ثنارة تكتب الآن
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>

          {showJump && (
            <button
              className="ir-jump"
              type="button"
              onClick={() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" })}
              aria-label="الانتقال إلى أحدث رسالة"
            >
              <ArrowDown size={15} /> أحدث رسالة
            </button>
          )}
        </main>

        <footer className="ir-composer-area">
          {messages.length === 1 && (
            <div className="ir-suggestions" aria-label="اقتراحات للبدء">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>
                  <Sparkles size={13} />{prompt}
                </button>
              ))}
            </div>
          )}
          {listening && (
            <div className="ir-voice-status" role="status">
              <span className="ir-voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span>جاري الاستماع... تحدث الآن</span>
              <button type="button" onClick={() => setListening(false)}>إيقاف</button>
            </div>
          )}
          {(notice || attachments.length > 0) && (
            <div className="ir-composer-notice" role="status">
              {attachments.map((file, index) => (
                <span className="ir-attachment" key={`${file.name}-${index}`}>
                  <FileText size={14} />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    aria-label={`إزالة ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                  ><X size={13} /></button>
                </span>
              ))}
              {notice && <span className="ir-notice-text"><Check size={13} />{notice}</span>}
            </div>
          )}

          <div className={`ir-composer ${input.trim() || attachments.length ? "ir-has-input" : ""}`}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="ir-file-input"
              aria-label="اختيار ملفات للإرفاق"
              onChange={onFilesSelected}
            />
            <button
              className="ir-send"
              type="button"
              onClick={streamingId !== null ? stopStreaming : () => sendMessage()}
              disabled={streamingId === null && !input.trim() && attachments.length === 0}
              aria-label={streamingId !== null ? "إيقاف الرد" : "إرسال الرسالة"}
              title={streamingId !== null ? "إيقاف الرد" : "إرسال الرسالة"}
            >
              {streamingId !== null ? <Square size={15} fill="currentColor" /> : <Send size={17} />}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setNotice("");
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 112)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={listening ? "يتم تحويل صوتك إلى نص..." : "اكتب رسالتك هنا..."}
              rows={1}
              aria-label="رسالتك"
            />
            <div className="ir-tools">
              <button
                type="button"
                className="ir-tool"
                onClick={() => fileInputRef.current?.click()}
                aria-label="إرفاق ملف"
                title="إرفاق ملف"
              ><Paperclip size={17} /></button>
              <button
                type="button"
                className={`ir-tool ir-mic ${listening ? "is-listening" : ""}`}
                onClick={() => {
                  setListening((active) => !active);
                  setNotice("");
                }}
                aria-label={listening ? "إيقاف استخدام الصوت" : "استخدام الصوت"}
                aria-pressed={listening}
                title="استخدام الصوت"
              ><Mic size={17} /></button>
            </div>
          </div>
          <p className="ir-footnote">ثنارة قد تخطئ أحيانًا. تحقّق من المعلومات المهمة.</p>
        </footer>
      </div>
    </div>
  );
}

const styles = `
.instant-reply {
  --ir-ink: #1c3028;
  --ir-muted: #77877f;
  --ir-green: #16815b;
  --ir-green-dark: #106747;
  --ir-mint: #eff8f2;
  --ir-border: #e6eee8;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  color: var(--ir-ink);
  background:
    radial-gradient(ellipse at 12% 6%, rgba(210, 235, 219, .72), transparent 36%),
    #edf3ee;
  font-family: "Noto Sans Arabic", Tahoma, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.instant-reply, .instant-reply * { box-sizing: border-box; }
.instant-reply button, .instant-reply textarea { font: inherit; }
.instant-reply button { -webkit-tap-highlight-color: transparent; }
.ir-frame {
  width: min(100%, 470px);
  height: min(960px, 100dvh);
  min-height: min(640px, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fbfdfb;
  border: 1px solid rgba(216, 229, 218, .84);
  box-shadow: 0 24px 80px rgba(45, 79, 58, .12);
  position: relative;
}
.ir-header {
  height: 67px;
  padding: 0 19px;
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #edf2ee;
  background: rgba(255,255,255,.93);
}
.ir-brand { display: flex; align-items: center; gap: 9px; }
.ir-brand-mark {
  width: 34px; height: 34px; border-radius: 12px;
  display: grid; place-items: center;
  background: #e8f5ed; color: var(--ir-green);
}
.ir-brand-name { font-size: 14px; font-weight: 750; letter-spacing: -.03em; }
.ir-brand-name b { color: var(--ir-green); font-size: 10px; direction: ltr; display: inline-block; }
.ir-online {
  margin-right: 3px; color: #7a8980; font-size: 10px;
  display: inline-flex; align-items: center; gap: 5px;
}
.ir-online i, .ir-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #3fa874; }
.ir-new-chat {
  display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px;
  border: 1px solid #e8efe9; background: #fff; color: #64736a; border-radius: 10px;
  font-size: 10px; cursor: pointer; transition: background .18s, color .18s, border-color .18s;
}
.ir-new-chat:hover { background: var(--ir-mint); border-color: #d3e8d8; color: var(--ir-green-dark); }
.ir-main { position: relative; min-height: 0; flex: 1; display: flex; flex-direction: column; }
.ir-messages { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #dce8df transparent; padding: 24px 17px 26px; }
.ir-date { display: flex; align-items: center; gap: 10px; margin: 0 0 24px; color: #a0ada4; font-size: 9px; justify-content: center; }
.ir-date::before, .ir-date::after { content: ""; height: 1px; width: 44px; background: #edf1ed; }
.ir-thread { display: flex; flex-direction: column; gap: 24px; }
.ir-message { display: flex; align-items: flex-start; gap: 9px; max-width: 100%; animation: ir-appear .32s ease both; }
.ir-message-content { min-width: 0; max-width: min(88%, 365px); }
.ir-assistant .ir-message-content { max-width: min(90%, 378px); }
.ir-user { justify-content: flex-start; }
.ir-user .ir-message-content { max-width: 84%; }
.ir-avatar { display: grid; flex: 0 0 29px; width: 29px; height: 29px; place-items: center; border-radius: 10px; color: var(--ir-green); background: #eaf5ed; margin-top: 18px; }
.ir-message-meta { min-height: 18px; display: flex; align-items: center; gap: 8px; margin: 0 4px 5px; }
.ir-message-meta strong { font-size: 10px; color: #405247; font-weight: 700; }
.ir-message-meta time { color: #a0aaa3; font-size: 9px; }
.ir-bubble { font-size: 12px; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
.ir-bubble p { margin: 0; }
.ir-assistant .ir-bubble {
  padding: 12px 14px; border: 1px solid #e9f0ea; border-radius: 5px 16px 16px 16px;
  background: #fff; color: #34463b; box-shadow: 0 5px 16px rgba(50, 79, 58, .035);
}
.ir-user .ir-bubble {
  padding: 10px 14px; border-radius: 16px 5px 16px 16px;
  color: #fff; background: #21815d; box-shadow: 0 5px 14px rgba(22, 129, 91, .14);
}
.ir-user .ir-message-meta { justify-content: flex-start; }
.ir-user .ir-message-meta strong { color: #54675c; }
.ir-file-in-message { display: flex; align-items: center; gap: 7px; max-width: 100%; width: fit-content; margin-bottom: 7px; padding: 6px 8px; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; background: rgba(255,255,255,.13); font-size: 10px; direction: rtl; }
.ir-file-in-message span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ir-cursor { display: inline-block; width: 2px; height: 14px; vertical-align: -3px; margin-right: 2px; background: #19845c; animation: ir-blink .8s steps(2, start) infinite; }
.ir-thinking { display: inline-flex; align-items: center; gap: 4px; color: #728178; font-size: 10px; }
.ir-thinking i { width: 4px; height: 4px; border-radius: 50%; background: #42966f; animation: ir-pulse 1s ease-in-out infinite; }
.ir-thinking i:nth-child(2) { animation-delay: .12s; }
.ir-thinking i:nth-child(3) { animation-delay: .24s; margin-left: 4px; }
.ir-thinking span { margin-right: 5px; }
.ir-stream-label { display: flex; align-items: center; gap: 6px; margin: 7px 5px 0; font-size: 9px; color: #71847a; }
.ir-live-dot { animation: ir-pulse 1.2s ease-in-out infinite; }
.ir-jump { position: absolute; z-index: 2; left: 50%; bottom: 13px; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; border: 1px solid #dce9df; border-radius: 20px; padding: 7px 11px; color: #356a4f; background: #fff; font-size: 10px; box-shadow: 0 4px 15px rgba(36,77,48,.12); cursor: pointer; }
.ir-composer-area { flex: 0 0 auto; border-top: 1px solid #eaf0eb; padding: 12px 14px max(10px, env(safe-area-inset-bottom)); background: #fff; }
.ir-suggestions { display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none; padding: 0 1px 10px; }
.ir-suggestions::-webkit-scrollbar { display: none; }
.ir-suggestions button { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; color: #427458; border: 1px solid #e0eee4; background: #f6fbf7; border-radius: 20px; padding: 7px 10px; font-size: 9px; cursor: pointer; transition: background .16s, border-color .16s; }
.ir-suggestions button:hover { background: #eaf5ed; border-color: #cde4d3; }
.ir-voice-status { display: flex; align-items: center; gap: 10px; padding: 8px 11px; margin-bottom: 8px; color: #4c6958; background: #f4faf5; border: 1px solid #e2efe5; border-radius: 12px; font-size: 10px; }
.ir-voice-status button { margin-right: auto; color: #a54e49; background: transparent; border: 0; padding: 3px 6px; font-size: 10px; cursor: pointer; }
.ir-voice-bars { height: 16px; display: flex; align-items: center; gap: 2px; }
.ir-voice-bars i { display: block; width: 2px; height: 5px; border-radius: 2px; background: #2e9464; animation: ir-wave .6s ease-in-out infinite alternate; }
.ir-voice-bars i:nth-child(2), .ir-voice-bars i:nth-child(4) { animation-delay: .15s; }
.ir-voice-bars i:nth-child(3) { animation-delay: .3s; }
.ir-composer-notice { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 2px 8px; }
.ir-attachment, .ir-notice-text { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-height: 27px; padding: 4px 7px; border-radius: 8px; color: #3c7653; background: #eef8f0; font-size: 9px; }
.ir-attachment > span { max-width: 195px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ir-attachment button { display: grid; place-items: center; padding: 2px; color: #6b8875; border: 0; background: none; cursor: pointer; }
.ir-notice-text { color: #66776c; background: transparent; }
.ir-composer { min-height: 59px; display: flex; align-items: flex-end; gap: 7px; padding: 7px; border: 1px solid #e5ece6; border-radius: 16px; background: #fbfcfb; box-shadow: 0 5px 19px rgba(37,73,49,.05); transition: border-color .18s, box-shadow .18s, background .18s; }
.ir-composer:focus-within { border-color: #a8d0b5; background: #fff; box-shadow: 0 0 0 3px rgba(44,139,89,.08); }
.ir-file-input { display: none; }
.ir-send, .ir-tool { flex: 0 0 auto; width: 38px; height: 38px; display: grid; place-items: center; border: 0; border-radius: 12px; cursor: pointer; transition: background .16s, color .16s, transform .16s; }
.ir-send { color: #fff; background: var(--ir-green); }
.ir-send:hover:not(:disabled) { background: var(--ir-green-dark); transform: translateY(-1px); }
.ir-send:disabled { color: #a4b7aa; background: #e8f0ea; cursor: not-allowed; }
.ir-composer textarea { flex: 1; min-width: 0; min-height: 38px; max-height: 112px; resize: none; padding: 9px 4px 7px; border: 0; outline: 0; color: #2c3c32; background: transparent; font-size: 12px; line-height: 1.7; text-align: right; }
.ir-composer textarea::placeholder { color: #a1aaa3; opacity: 1; }
.ir-tools { display: flex; flex: 0 0 auto; gap: 2px; direction: ltr; }
.ir-tool { width: 35px; height: 38px; color: #75847a; background: transparent; }
.ir-tool:hover { color: var(--ir-green); background: #eff7f1; }
.ir-tool.is-listening { color: #a84c46; background: #fff0ee; animation: ir-mic 1.2s ease-in-out infinite; }
.ir-footnote { margin: 8px 2px 0; text-align: center; color: #a0aaa2; font-size: 8px; }
.instant-reply button:focus-visible, .instant-reply textarea:focus-visible { outline: 3px solid rgba(42, 138, 88, .28); outline-offset: 2px; }
@keyframes ir-appear { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ir-blink { to { visibility: hidden; } }
@keyframes ir-pulse { 0%, 100% { opacity: .45; transform: scale(.82); } 50% { opacity: 1; transform: scale(1); } }
@keyframes ir-wave { to { height: 14px; } }
@keyframes ir-mic { 50% { transform: scale(1.05); } }
@media (min-width: 700px) {
  .ir-frame { border-radius: 22px; height: min(900px, calc(100dvh - 48px)); min-height: 600px; }
  .ir-header { border-radius: 22px 22px 0 0; }
}
@media (max-width: 390px) {
  .ir-header { padding-inline: 13px; }
  .ir-online { font-size: 9px; }
  .ir-new-chat { padding-inline: 8px; }
  .ir-messages { padding-inline: 12px; }
  .ir-composer-area { padding-inline: 10px; }
  .ir-suggestions button { font-size: 8px; }
}
@media (max-height: 700px) and (max-width: 699px) {
  .ir-frame { min-height: 0; }
  .ir-messages { padding-top: 14px; padding-bottom: 14px; }
  .ir-thread { gap: 15px; }
  .ir-date { margin-bottom: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .instant-reply *, .instant-reply *::before, .instant-reply *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    scroll-behavior: auto !important; transition-duration: .01ms !important;
  }
}
`;