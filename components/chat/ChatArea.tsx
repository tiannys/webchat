'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { sendMessageToN8n } from '@/lib/n8n';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    updateDoc,
} from 'firebase/firestore';
import { Message, AIProvider } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatAreaProps {
    conversationId: string;
    onTitleChange?: (title: string) => void;
}

export default function ChatArea({ conversationId, onTitleChange }: ChatAreaProps) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [aiProviders, setAiProviders] = useState<AIProvider[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch AI providers
    useEffect(() => {
        const q = query(
            collection(db, 'ai_providers'),
            orderBy('order', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const providers: AIProvider[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as Omit<AIProvider, 'id'>;
                if (data.isActive) {
                    providers.push({ id: doc.id, ...data });
                }
            });
            setAiProviders(providers);
            // Set default provider if not set
            if (!selectedProvider && providers.length > 0) {
                setSelectedProvider(providers[0].key);
            }
        });

        return () => unsubscribe();
    }, [selectedProvider]);

    useEffect(() => {
        const q = query(
            collection(db, 'conversations', conversationId, 'messages'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((doc) => {
                msgs.push({ id: doc.id, ...doc.data() } as Message);
            });
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [conversationId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const updateConversationTitle = async (firstMessage: string) => {
        const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
        try {
            await updateDoc(doc(db, 'conversations', conversationId), {
                title,
                updatedAt: serverTimestamp(),
            });
            onTitleChange?.(title);
        } catch (error) {
            console.error('Error updating title:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setLoading(true);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            // Add user message
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                role: 'user',
                content: userMessage,
                createdAt: serverTimestamp(),
            });

            // Update title if first message
            if (messages.length === 0) {
                updateConversationTitle(userMessage);
            }

            // Update conversation timestamp
            await updateDoc(doc(db, 'conversations', conversationId), {
                updatedAt: serverTimestamp(),
            });

            // Send to n8n with selected AI provider
            const response = await sendMessageToN8n(userMessage, conversationId, selectedProvider);

            // Add assistant message
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                role: 'assistant',
                content: response,
                createdAt: serverTimestamp(),
            });
        } catch (error) {
            console.error('Error sending message:', error);
            // Add error message
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                role: 'assistant',
                content: 'Sorry, an error occurred. Please try again.',
                createdAt: serverTimestamp(),
            });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // Auto-resize textarea
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    };

    return (
        <div className="chat-area">
            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-chat">
                        <div className="empty-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                        <h2>Start a Conversation</h2>
                        <p>Type a message below to begin</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div key={message.id} className={`message ${message.role}`}>
                            <div className="message-avatar">
                                {message.role === 'user' ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                )}
                            </div>
                            <div className="message-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="message assistant">
                        <div className="message-avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                        <div className="message-content">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* AI Provider Selector */}
            <div className="ai-selector-container">
                <div className="ai-selector">
                    <label>AI Model:</label>
                    <select
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        disabled={loading || aiProviders.length === 0}
                    >
                        {aiProviders.length === 0 ? (
                            <option value="">No providers configured</option>
                        ) : (
                            aiProviders.map((provider) => (
                                <option key={provider.id} value={provider.key}>
                                    {provider.name}
                                </option>
                            ))
                        )}
                    </select>
                    <button
                        className="settings-link"
                        onClick={() => router.push('/settings')}
                        title="Manage AI Providers"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="input-container">
                <div className="input-wrapper">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        disabled={loading}
                        rows={1}
                    />
                    <button type="submit" disabled={!input.trim() || loading}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </div>
                <p className="input-hint">Press Enter to send, Shift+Enter for new line</p>
            </form>
        </div>
    );
}

