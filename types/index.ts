import { Timestamp } from 'firebase/firestore';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Timestamp | Date;
}

export interface Conversation {
    id: string;
    userId: string;
    title: string;
    createdAt: Timestamp | Date;
    updatedAt: Timestamp | Date;
}

export interface UserProfile {
    email: string;
    displayName: string;
    createdAt: Timestamp | Date;
}
