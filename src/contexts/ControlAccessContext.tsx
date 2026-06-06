'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface ControlAccessContextType {
    isAuthenticated: boolean;
    authenticate: (password: string) => Promise<boolean>;
    logout: () => void;
}

const ControlAccessContext = createContext<ControlAccessContextType | undefined>(undefined);

const SESSION_KEY = 'control_panel_authenticated';

// SHA-256 hash of the correct password — the actual password is never in the bundle
const PASSWORD_HASH = '1d24bf71a3bfc2f0cb03743f52c76cdecdb39512843615edb9d0413ec1025d0d';

function sha256(message: string): string {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

    // UTF-8 encode
    const bytes: number[] = [];
    for (let i = 0; i < message.length; i++) {
        const c = message.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    for (let i = 0; i < bytes.length; i += 64) {
        const w = new Uint32Array(64);
        for (let j = 0; j < 16; j++)
            w[j] = (bytes[i+j*4] << 24) | (bytes[i+j*4+1] << 16) | (bytes[i+j*4+2] << 8) | bytes[i+j*4+3];
        for (let j = 16; j < 64; j++) {
            const s0 = rr(w[j-15], 7) ^ rr(w[j-15], 18) ^ (w[j-15] >>> 3);
            const s1 = rr(w[j-2], 17) ^ rr(w[j-2], 19) ^ (w[j-2] >>> 10);
            w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
        for (let j = 0; j < 64; j++) {
            const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
            const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
        }
        h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
        h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(n => n.toString(16).padStart(8, '0')).join('');
}

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

    const authenticate = async (password: string): Promise<boolean> => {
        const inputHash = sha256(password);

        if (inputHash === PASSWORD_HASH) {
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
