'use client';

import { useEffect, useState, useRef } from 'react';
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
import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatAreaProps {
    conversationId: string;
    onTitleChange?: (title: string) => void;
}

export default function ChatArea({ conversationId, onTitleChange }: ChatAreaProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

            // Send to n8n and get response
            const response = await sendMessageToN8n(userMessage, conversationId);

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
