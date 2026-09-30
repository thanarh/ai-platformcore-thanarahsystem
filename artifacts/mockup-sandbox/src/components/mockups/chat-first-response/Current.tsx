import { useState } from "react";
import { Mic, Paperclip, Send, Sparkles } from "lucide-react";
import "./_group.css";

export function Current() {
  const [input, setInput] = useState("هلا");
  const [startingChat, setStartingChat] = useState(false);

  const start = () => {
    if (!input.trim() || startingChat) return;
    setStartingChat(true);
  };

  return (
    <div
      className="chat-flow-preview min-h-screen bg-[#f8fbfc] px-5 text-[#17232c]"
      dir="rtl"
    >
      <header className="flex h-[68px] items-center justify-between border-b border-[#edf1f2]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f5ed] text-[#16815b]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-arabic text-[13px] font-semibold">ثنارة AI</span>
        </div>
        <span className="font-arabic text-[11px] text-[#69767e]">محادثة جديدة</span>
      </header>

      <main className="mx-auto flex max-w-[660px] flex-col items-center pt-[145px]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#16815b] shadow-[0_8px_24px_rgba(40,110,82,0.1)]">
          <Sparkles className="h-5 w-5" />
        </span>
        <h1 className="font-arabic mt-5 text-center text-[25px] font-bold">
          كيف أساعدك اليوم؟
        </h1>
        <p className="font-arabic mt-2 text-center text-[12px] text-[#69767e]">
          اكتب سؤالك وسأبدأ بمساعدتك.
        </p>

        <section className="mt-7 w-full">
          <div
            className="flex min-h-[62px] items-center gap-2 rounded-[17px] border border-[#edf1f2] bg-white px-3 py-2 shadow-[0_8px_26px_rgba(40,75,91,0.08)]"
            dir="rtl"
          >
            <button
              type="button"
              onClick={start}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#16815b] text-white transition hover:bg-[#116e4d] disabled:bg-[#dce9e4]"
              aria-label="إرسال الرسالة"
              disabled={!input.trim() || startingChat}
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  start();
                }
              }}
              placeholder="اكتب رسالتك هنا..."
              rows={1}
              className="font-arabic min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2.5 text-right text-[13px] text-[#2b3940] outline-none placeholder:text-[#8e989e]"
              aria-label="رسالتك"
            />
            <div className="flex flex-shrink-0 items-center gap-1" dir="ltr">
              <button
                type="button"
                onClick={start}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e] transition hover:bg-[#eef5f2] hover:text-[#16815b]"
                aria-label="إرفاق ملف"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={start}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e] transition hover:bg-[#eef5f2] hover:text-[#16815b]"
                aria-label="استخدام الصوت"
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
          {startingChat && (
            <p role="status" className="font-arabic mt-3 text-center text-xs text-[#69767e]">
              جارٍ فتح المحادثة...
            </p>
          )}
        </section>
      </main>
    </div>
  );
}