'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Send, Square, Copy, Menu, ThumbsUp, ThumbsDown, Pin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { messagesApi } from '@/lib/api';
import { streamChat, cn, isRTL } from '@/lib/utils';
import { ThanarahIcon } from '@/components/ThanarahLogo';

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const convId = params.id as string;

  const { token } = useAuthStore();
  const {
    messages, addMessage, setMessages, updateLastMessage,
    finalizeLastMessage, updateMessage,
    isStreaming, setStreaming, setLoading, isLoading, toggleSidebar,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const convMessages: Message[] = messages[convId] || [];

  useEffect(() => {
    if (!convId) return;
    setLoading(true);
    messagesApi.list(convId)
      .then((msgs) => {
        setMessages(convId, msgs);
        const savedFeedback: Record<string, 'up' | 'down'> = {};
        msgs.forEach((message: Message) => {
          if (message._id && message.feedback?.rating) savedFeedback[message._id] = message.feedback.rating;
        });
        setFeedback(savedFeedback);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [convId]);

  useEffect(() => {
    const prompt = searchParams?.get('prompt');
    if (prompt && convMessages.length === 0) {
      setInput(prompt);
      setTimeout(() => handleSend(prompt), 100);
    }
  }, [convId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convMessages]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent || input).trim();
    if (!content || isStreaming || !token) return;

    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    setAbortController(controller);

    // Add user message
    addMessage(convId, { role: 'user', content, createdAt: new Date().toISOString() });

    // Add an operational placeholder immediately; it is not model reasoning.
    addMessage(convId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
      streamStatus: 'analyzing',
    });

    let accumulated = '';

    await streamChat(
      convId,
      content,
      token,
      (delta) => {
        accumulated += delta;
        updateLastMessage(convId, accumulated, false, 'generating');
      },
      (meta) => {
        finalizeLastMessage(convId, accumulated, meta);
        setStreaming(false);
        setAbortController(null);
        window.dispatchEvent(new Event('thanarah-usage-changed'));
      },
      (err) => {
        finalizeLastMessage(convId, err || 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى.');
        setStreaming(false);
        setAbortController(null);
        window.dispatchEvent(new Event('thanarah-usage-changed'));
      },
      controller.signal,
    );
  }, [input, convId, token, isStreaming, addMessage, finalizeLastMessage, setStreaming, updateLastMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white h-14 flex-shrink-0 safe-area-x">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] sm:text-xs text-amber-800 font-arabic whitespace-nowrap" dir="rtl">
          نسخة تجريبية · اكتمال المشروع 100%
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {isLoading && convMessages.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {convMessages.map((msg, idx) => (
          <MessageBubble
            key={msg._id || idx}
            message={msg}
            onCopy={() => handleCopy(msg.content)}
            onPin={async () => {
              if (!msg._id) return;
              const pinned = !msg.isPinned;
              try {
                await messagesApi.pin(msg._id, pinned);
                updateMessage(convId, msg._id, { isPinned: pinned });
              } catch {}
            }}
            feedback={msg._id ? feedback[msg._id] : undefined}
            onFeedback={async (rating) => {
              if (!msg._id) return;
              const correction = rating === 'down' && typeof window !== 'undefined'
                ? window.prompt('ما التصحيح أو التحسين المطلوب؟') || undefined
                : undefined;
              try {
                await messagesApi.feedback(msg._id, rating, correction);
                setFeedback((current) => ({ ...current, [msg._id as string]: rating }));
              } catch {}
            }}
          />

        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-200 bg-white flex-shrink-0 safe-area-x">
        <div
          className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-thanarah-400 focus-within:ring-1 focus-within:ring-thanarah-400 transition"
          dir="rtl"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
            className="flex-1 bg-transparent resize-none outline-none text-base sm:text-sm text-gray-800 placeholder-gray-400 font-arabic leading-relaxed max-h-40"
            rows={1}
            dir={isRTL(input) ? 'rtl' : 'ltr'}
            style={{ minHeight: '24px' }}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={() => abortController?.abort()}
                className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-lg transition"
                title="إيقاف"
              >
                <Square className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="w-8 h-8 flex items-center justify-center bg-thanarah-700 hover:bg-thanarah-600 disabled:bg-gray-200 rounded-lg transition disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 text-white disabled:text-gray-400" />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2 font-arabic">
          ثنارة AI قد يرتكب أخطاء. تحقق من المعلومات المهمة.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message, onCopy, onPin, onFeedback, feedback }: { message: Message; onCopy: () => void; onPin: () => void; onFeedback: (rating: 'up' | 'down') => void; feedback?: 'up' | 'down' }) {
  const isUser = message.role === 'user';
  const isArabic = isRTL(message.content);

  return (
    <div className="flex justify-start animate-message-in">
      <div className={cn('max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]', isUser ? 'mr-auto' : 'ml-auto')}>
        {isUser ? (
          <div className="group">
            <div
              className="bg-thanarah-700 text-white rounded-2xl rounded-tl-md px-4 py-3 text-sm font-arabic leading-relaxed"
              dir={isArabic ? 'rtl' : 'ltr'}
            >
              {message.content}
            </div>
            {message._id && (
              <div className="mt-1 flex justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <button
                  onClick={onPin}
                  className={cn('p-1 transition', message.isPinned ? 'text-thanarah-600' : 'text-gray-400 hover:text-thanarah-600')}
                  title={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}
                >
                  <Pin className={cn('w-3.5 h-3.5', message.isPinned && 'fill-current')} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className="group bg-transparent px-1 py-2"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            {message.isStreaming && !message.content ? (
              <div
                className="flex min-h-10 items-center gap-2 text-xs text-gray-500"
                role="status"
                aria-label="جارٍ تجهيز الرد"
                aria-live="polite"
              >
                <ThanarahIcon
                  size={24}
                  className="animate-thanarah-loading"
                />
                <span>
                  {message.streamStatus === 'analyzing'
                    ? 'Analyzing...'
                    : 'Generating response...'}
                </span>
              </div>
            ) : (
              <>
                {message.isStreaming && (
                  <div
                    className="mb-2 flex items-center gap-2 text-[11px] text-gray-500"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-thanarah-600 animate-pulse-subtle" />
                    <span>Generating response...</span>
                  </div>
                )}
                <div className={cn('prose-chat text-gray-800', isArabic ? 'font-arabic' : '')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.isStreaming && (
                  <span className="inline-block w-1 h-4 bg-thanarah-600 animate-pulse-subtle rounded ml-0.5" />
                )}
                {message.streamStatus === 'stopped' && !message.isStreaming && (
                  <div className="mt-2 text-[11px] text-gray-400" role="status">
                    Response stopped
                  </div>
                )}
                {!message.isStreaming && message.content && (
                  <div className="flex items-center justify-end mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <button
                      onClick={onPin}
                      className={cn('p-1 transition', message.isPinned ? 'text-thanarah-600' : 'text-gray-400 hover:text-thanarah-600')}
                      title={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}
                    >
                      <Pin className={cn('w-3.5 h-3.5', message.isPinned && 'fill-current')} />
                    </button>
                    <button
                      onClick={() => onFeedback('up')}
                      className={cn('p-1 transition', feedback === 'up' ? 'text-green-600' : 'text-gray-400 hover:text-green-600')}
                      title="رد مفيد"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onFeedback('down')}
                      className={cn('p-1 transition', feedback === 'down' ? 'text-red-600' : 'text-gray-400 hover:text-red-600')}
                      title="يحتاج إلى تحسين"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onCopy}
                      className="p-1 text-gray-400 hover:text-gray-600 transition"
                      title="نسخ"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
