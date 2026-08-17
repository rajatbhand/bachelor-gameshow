'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The failover switch, shared by both apps.
 *
 * `control/mode.backupMode` is the single flag that decides who owns the show:
 *   false → this server is the authority and mirrors state to Firestore
 *   true  → the server pauses mirroring and the no-server BACKUP app takes over
 *
 * It deliberately goes straight to Firestore rather than through the socket:
 * the moment you need it most is the moment the server is unreachable, so the
 * switch must not depend on the server being alive. It also lives in its own
 * document — NOT in gameState/live — because the server's mirror overwrites
 * that document wholesale and would wipe the flag on its next write.
 *
 * Operational rule: once you have switched to the backup, do NOT bring the
 * server back mid-show. Both would then be writing gameState/live.
 *
 * This copy lives in the BACKUP app: here `true` means "you are in control".
 */
export function useBackupMode() {
  const [backupMode, setLocal] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'control', 'mode');
    return onSnapshot(
      ref,
      (snap) => {
        setLocal(snap.exists() ? Boolean(snap.data()?.backupMode) : false);
        setReady(true);
      },
      (err) => {
        console.error('control/mode listener error:', err);
        setReady(true);
      },
    );
  }, []);

  const setBackupMode = useCallback(async (next: boolean) => {
    await setDoc(doc(db, 'control', 'mode'), { backupMode: next, updatedAt: Date.now() });
  }, []);

  return { backupMode, setBackupMode, ready };
}
