'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
} from 'firebase/firestore';
import { AIProvider } from '@/types';

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
    const [formData, setFormData] = useState({ name: '', key: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        const q = query(
            collection(db, 'ai_providers'),
            orderBy('order', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const providerList: AIProvider[] = [];
            snapshot.forEach((doc) => {
                providerList.push({ id: doc.id, ...doc.data() } as AIProvider);
            });
            setProviders(providerList);
        });

        return () => unsubscribe();
    }, []);

    const openAddModal = () => {
        setEditingProvider(null);
        setFormData({ name: '', key: '' });
        setIsModalOpen(true);
    };

    const openEditModal = (provider: AIProvider) => {
        setEditingProvider(provider);
        setFormData({ name: provider.name, key: provider.key });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProvider(null);
        setFormData({ name: '', key: '' });
    };

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.key.trim()) return;

        setSaving(true);
        try {
            if (editingProvider) {
                await updateDoc(doc(db, 'ai_providers', editingProvider.id), {
                    name: formData.name.trim(),
                    key: formData.key.trim().toLowerCase(),
                });
            } else {
                await addDoc(collection(db, 'ai_providers'), {
                    name: formData.name.trim(),
                    key: formData.key.trim().toLowerCase(),
                    isActive: true,
                    order: providers.length,
                    createdAt: serverTimestamp(),
                });
            }
            closeModal();
        } catch (error) {
            console.error('Error saving provider:', error);
        } finally {
            setSaving(false);
        }
    };

    const toggleProvider = async (provider: AIProvider) => {
        try {
            await updateDoc(doc(db, 'ai_providers', provider.id), {
                isActive: !provider.isActive,
            });
        } catch (error) {
            console.error('Error toggling provider:', error);
        }
    };

    const deleteProvider = async (providerId: string) => {
        if (!confirm('Are you sure you want to delete this AI provider?')) return;

        try {
            await deleteDoc(doc(db, 'ai_providers', providerId));
        } catch (error) {
            console.error('Error deleting provider:', error);
        }
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
        <div className="settings-container">
            <div className="settings-header">
                <button className="back-btn" onClick={() => router.push('/chat')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1>Settings</h1>
            </div>

            <div className="settings-card">
                <div className="settings-card-header">
                    <h2>AI Providers</h2>
                    <button className="add-btn" onClick={openAddModal}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add Provider
                    </button>
                </div>

                <div className="provider-list">
                    {providers.length === 0 ? (
                        <div className="empty-providers">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                                <path d="M12 6v6l4 2" />
                            </svg>
                            <p>No AI providers configured yet</p>
                            <button className="add-btn" onClick={openAddModal}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                Add Your First Provider
                            </button>
                        </div>
                    ) : (
                        providers.map((provider) => (
                            <div key={provider.id} className="provider-item">
                                <div
                                    className={`provider-toggle ${provider.isActive ? 'active' : ''}`}
                                    onClick={() => toggleProvider(provider)}
                                />
                                <div className="provider-info">
                                    <div className="provider-name">{provider.name}</div>
                                    <div className="provider-key">{provider.key}</div>
                                </div>
                                <div className="provider-actions">
                                    <button className="edit-btn" onClick={() => openEditModal(provider)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>
                                    <button className="delete-provider-btn" onClick={() => deleteProvider(provider.id)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingProvider ? 'Edit Provider' : 'Add New Provider'}</h3>
                            <button className="modal-close" onClick={closeModal}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Display Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Gemini 2.5 Flash"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Provider Key (for n8n routing)</label>
                                <input
                                    type="text"
                                    placeholder="e.g., gemini"
                                    value={formData.key}
                                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={closeModal}>Cancel</button>
                            <button
                                className="btn-save"
                                onClick={handleSave}
                                disabled={!formData.name.trim() || !formData.key.trim() || saving}
                            >
                                {saving ? 'Saving...' : editingProvider ? 'Update' : 'Add Provider'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
