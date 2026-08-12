'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Send, Square, RefreshCw, Copy, Menu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { messagesApi } from '@/lib/api';
import { streamChat, cn, isRTL } from '@/lib/utils';

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const convId = params.id as string;

  const { token } = useAuthStore();
  const {
    messages, addMessage, setMessages, updateLastMessage,
    isStreaming, setStreaming, setLoading, isLoading, toggleSidebar,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const convMessages: Message[] = messages[convId] || [];

  useEffect(() => {
    if (!convId) return;
    setLoading(true);
    messagesApi.list(convId)
      .then((msgs) => setMessages(convId, msgs))
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

    // Add user message
    addMessage(convId, { role: 'user', content, createdAt: new Date().toISOString() });

    // Add placeholder assistant message
    addMessage(convId, { role: 'assistant', content: '', isStreaming: true });

    let accumulated = '';

    await streamChat(
      convId,
      content,
      token,
      (delta) => {
        accumulated += delta;
        updateLastMessage(convId, accumulated, false);
      },
      (meta) => {
        updateLastMessage(convId, accumulated, true);
        setStreaming(false);
      },
      (err) => {
        updateLastMessage(convId, 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى.', true);
        setStreaming(false);
      }
    );
  }, [input, convId, token, isStreaming]);

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
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white h-14 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 font-arabic" dir="rtl">
          ثنارة AI
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {isLoading && convMessages.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {convMessages.map((msg, idx) => (
          <MessageBubble
            key={idx}
            message={msg}
            onCopy={() => handleCopy(msg.content)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
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
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-400 font-arabic leading-relaxed max-h-40"
            rows={1}
            dir={isRTL(input) ? 'rtl' : 'ltr'}
            style={{ minHeight: '24px' }}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={() => setStreaming(false)}
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

function MessageBubble({ message, onCopy }: { message: Message; onCopy: () => void }) {
  const isUser = message.role === 'user';
  const isArabic = isRTL(message.content);

  return (
    <div className={cn('flex', isUser ? 'justify-start' : 'justify-start')}>
      <div className={cn('max-w-[85%] lg:max-w-[75%]', isUser ? 'mr-auto' : 'ml-auto')}>
        {isUser ? (
          <div
            className="bg-thanarah-700 text-white rounded-2xl rounded-tl-md px-4 py-3 text-sm font-arabic leading-relaxed"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            {message.content}
          </div>
        ) : (
          <div
            className="bg-white border border-gray-200 rounded-2xl rounded-tr-md px-4 py-3 shadow-sm group"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-1.5 py-1">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            ) : (
              <>
                <div className={cn('prose-chat text-gray-800', isArabic ? 'font-arabic' : '')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.isStreaming && (
                  <span className="inline-block w-1 h-4 bg-thanarah-600 animate-pulse-subtle rounded ml-0.5" />
                )}
                {!message.isStreaming && message.content && (
                  <div className="flex items-center justify-end mt-2 opacity-0 group-hover:opacity-100 transition">
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
