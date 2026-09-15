'use client';
import { create } from 'zustand';

export interface Message {
  _id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  feedback?: {
    rating?: 'up' | 'down';
    correction?: string;
    createdAt?: string;
  };
  aiMetadata?: {
    model?: string;
    backend?: string;
    routeDecision?: string;
    latency?: number;
    ragSources?: any[];
  };
  createdAt?: string;
}

export interface Conversation {
  _id: string;
  title: string;
  messageCount: number;
  lastMessageAt?: string;
  createdAt?: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isLoading: boolean;
  isStreaming: boolean;
  sidebarOpen: boolean;
  
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  
  setMessages: (convId: string, msgs: Message[]) => void;
  addMessage: (convId: string, msg: Message) => void;
  updateLastMessage: (convId: string, content: string, done?: boolean) => void;
  
  setLoading: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoading: false,
  isStreaming: false,
  sidebarOpen: true,

  setConversations: (convs) => set({ conversations: convs }),
  addConversation: (conv) =>
    set((s) => ({ conversations: [conv, ...s.conversations] })),
  updateConversation: (id, data) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c._id === id ? { ...c, ...data } : c
      ),
    })),
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c._id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    })),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (convId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [convId]: msgs } })),
  addMessage: (convId, msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: [...(s.messages[convId] || []), msg],
      },
    })),
  updateLastMessage: (convId, content, done = false) =>
    set((s) => {
      const msgs = [...(s.messages[convId] || [])];
      if (msgs.length === 0) return s;
      const last = { ...msgs[msgs.length - 1] };
      last.content = content;
      last.isStreaming = !done;
      msgs[msgs.length - 1] = last;
      return { messages: { ...s.messages, [convId]: msgs } };
    }),

  setLoading: (v) => set({ isLoading: v }),
  setStreaming: (v) => set({ isStreaming: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
}));
