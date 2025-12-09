'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    isAllowedDomain: (email: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getAllowedDomains = (): string[] => {
    const domains = process.env.NEXT_PUBLIC_ALLOWED_DOMAINS || '';
    return domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const isAllowedDomain = (email: string): boolean => {
        const allowedDomains = getAllowedDomains();
        if (allowedDomains.length === 0) return true;

        const emailDomain = email.split('@')[1]?.toLowerCase();
        return allowedDomains.includes(emailDomain);
    };

    const login = async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
    };

    const register = async (email: string, password: string, displayName: string) => {
        if (!isAllowedDomain(email)) {
            const allowedDomains = getAllowedDomains();
            throw new Error(`อนุญาตเฉพาะอีเมลที่มี domain: ${allowedDomains.join(', ')}`);
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Update display name
        await updateProfile(userCredential.user, { displayName });

        // Create user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            email,
            displayName,
            createdAt: serverTimestamp(),
        });
    };

    const logout = async () => {
        await signOut(auth);
    };

    const resetPassword = async (email: string) => {
        await sendPasswordResetEmail(auth, email);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                register,
                logout,
                resetPassword,
                isAllowedDomain,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
