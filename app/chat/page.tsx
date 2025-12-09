'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    deleteDoc,
} from 'firebase/firestore';
import { Conversation } from '@/types';
import ChatArea from '../../components/chat/ChatArea';

export default function ChatPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [creatingConversation, setCreatingConversation] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'conversations'),
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const convs: Conversation[] = [];
            snapshot.forEach((doc) => {
                convs.push({ id: doc.id, ...doc.data() } as Conversation);
            });
            setConversations(convs);
        });

        return () => unsubscribe();
    }, [user]);

    const createNewConversation = useCallback(async () => {
        if (!user || creatingConversation) return;

        setCreatingConversation(true);
        try {
            const docRef = await addDoc(collection(db, 'conversations'), {
                userId: user.uid,
                title: 'New Chat',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            setSelectedConversation(docRef.id);
        } catch (error) {
            console.error('Error creating conversation:', error);
        } finally {
            setCreatingConversation(false);
        }
    }, [user, creatingConversation]);

    const deleteConversation = async (convId: string) => {
        try {
            await deleteDoc(doc(db, 'conversations', convId));
            if (selectedConversation === convId) {
                setSelectedConversation(null);
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="chat-layout">
            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <button
                        className="new-chat-btn"
                        onClick={createNewConversation}
                        disabled={creatingConversation}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Chat
                    </button>
                </div>

                <div className="conversations-list">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={`conversation-item ${selectedConversation === conv.id ? 'active' : ''}`}
                            onClick={() => setSelectedConversation(conv.id)}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="conversation-title">{conv.title}</span>
                            <button
                                className="delete-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteConversation(conv.id);
                                }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user.displayName?.[0] || user.email?.[0] || 'U'}
                        </div>
                        <span className="user-name">{user.displayName || user.email}</span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                        </svg>
                    </button>
                </div>
            </aside>

            {/* Toggle Button */}
            <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(!sidebarOpen)}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {sidebarOpen ? (
                        <path d="M15 18l-6-6 6-6" />
                    ) : (
                        <path d="M9 18l6-6-6-6" />
                    )}
                </svg>
            </button>

            {/* Chat Area */}
            <main className="chat-main">
                {selectedConversation ? (
                    <ChatArea
                        conversationId={selectedConversation}
                        onTitleChange={(_title: string) => {
                            // Title updates handled in ChatArea
                        }}
                    />
                ) : (
                    <div className="welcome-screen">
                        <div className="welcome-content">
                            <div className="welcome-logo">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <h1>Welcome to WebChat</h1>
                            <p>Start a new conversation or select an existing one</p>
                            <button
                                className="btn-primary large"
                                onClick={createNewConversation}
                                disabled={creatingConversation}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                Start New Chat
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
