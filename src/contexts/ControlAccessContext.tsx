'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface ControlAccessContextType {
    isAuthenticated: boolean;
    authenticate: (password: string) => boolean;
    logout: () => void;
}

const ControlAccessContext = createContext<ControlAccessContextType | undefined>(undefined);

const SESSION_KEY = 'control_panel_authenticated';

export function ControlAccessProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Check sessionStorage on mount
    useEffect(() => {
        // Only run in browser
        if (typeof window !== 'undefined') {
            const storedAuth = sessionStorage.getItem(SESSION_KEY);
            if (storedAuth === 'true') {
                setIsAuthenticated(true);
            }
        }
        setIsInitialized(true);
    }, []);

    const authenticate = (password: string): boolean => {
        const correctPassword = process.env.NEXT_PUBLIC_CONTROL_PASSWORD;

        if (!correctPassword) {
            console.error('NEXT_PUBLIC_CONTROL_PASSWORD is not set in environment variables');
            return false;
        }

        if (password === correctPassword) {
            setIsAuthenticated(true);
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(SESSION_KEY, 'true');
            }
            return true;
        }

        return false;
    };

    const logout = () => {
        setIsAuthenticated(false);
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(SESSION_KEY);
        }
    };

    const value = {
        isAuthenticated,
        authenticate,
        logout
    };

    // Render children immediately - the control page itself will handle the auth check
    return (
        <ControlAccessContext.Provider value={value}>
            {children}
        </ControlAccessContext.Provider>
    );
}

export function useControlAccess() {
    const context = useContext(ControlAccessContext);
    if (context === undefined) {
        throw new Error('useControlAccess must be used within a ControlAccessProvider');
    }
    return context;
}
