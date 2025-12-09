import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
  writeBatch,
  where,
  documentId
} from 'firebase/firestore';
import { db } from './firebase';

// Game State Types
export interface GameState {
  currentRound: 'pre-show' | 'round1' | 'round2' | 'round3' | 'final';
  currentQuestion: string | null;
  activeTeam: 'red' | 'green' | 'blue' | 'host' | null;
  bigX: boolean;
  scorecardOverlay: boolean;
  audienceWindow: boolean;
  logoOnly: boolean;
  questionRevealed: boolean;
  revealMode: 'one-by-one' | 'all-at-once';
  guessMode: boolean;
  lastUpdated: unknown;
  // Voting round tracking
  votingRound: number; // Track which voting round we're in (increments each time voting opens)
  // Episode information
  episodeInfo: string | null; // Operator-provided episode information shown to audience
  // Timer state (used by Round 2)
  timerActive: boolean;
  timerStartTime: number | null;
  timerDuration: number;
  // Round 1 strike tracking (strikes per team/panelist)
  round1Strikes: {
    red: number;
    green: number;
    blue: number;
  };
  // Round 1 state
  round1Active: boolean; // Whether Round 1 gameplay is active
  round1CurrentGuessingTeam: 'red' | 'green' | 'blue' | null; // Which team is currently making a guess
  // Round 2 state
  round2State?: {
    phase: 'selection' | 'question' | 'reveal';
    availableQuestionIds: string[];
    activeQuestionId: string | null;
    timerDuration: number;
  };
  round2Options?: string[]; // The three questions selected by operator for the round
  round2CurrentTeam?: 'red' | 'green' | 'blue' | null; // Which team is currently playing Round 2
  round2UsedQuestionIds?: string[]; // Track questions used across all teams
}

export interface Team {
  id: 'red' | 'green' | 'blue';
  name: string;
  score: number;
  dugoutCount: number;
  color: string;
}

export interface Question {
  id: string;
  text: string;
  answers: Answer[];
  answerCount: number;
}

export interface Answer {
  id: string;
  text: string;
  value: number;
  revealed: boolean;
  attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral' | null;
  revealedAt?: unknown;
}

export interface AudienceMember {
  id: string; // Firestore document ID (using deviceId for consistency)
  // Layer 1: Device Fingerprint
  deviceId: string; // Unique device identifier stored in localStorage
  // Layer 2: Contact Information
  name: string;
  phone: string; // Phone number for contact
  upiId: string; // UPI ID for payment
  // Layer 3: Firebase Authentication
  authUid: string; // Firebase Auth UID
  authEmail: string | null; // Email from auth provider (if available)
  authProvider: 'google' | 'email' | 'unknown'; // Which auth method was used
  // Voting information
  team: 'red' | 'green' | 'blue';
  submittedAt: unknown;
  votingRound: number; // Track which round this vote was cast in
  previousTeam: 'red' | 'green' | 'blue' | null; // Track if voter switched teams
  updatedAt: unknown; // Timestamp of last update
}


// Game State Management
export class GameStateManager {
  private static instance: GameStateManager;
  private listeners: Map<string, () => void> = new Map();

  static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  // Initialize game state
  async initializeGame(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);

    if (!gameStateDoc.exists()) {
      const initialState: GameState = {
        currentRound: 'pre-show',
        currentQuestion: null,
        activeTeam: null,
        bigX: false,
        scorecardOverlay: false,
        audienceWindow: false,
        logoOnly: true,
        questionRevealed: false,
        revealMode: 'one-by-one',
        guessMode: false,
        lastUpdated: serverTimestamp(),
        // Voting round tracking
        votingRound: 1,
        // Episode information
        episodeInfo: null,
        // Timer state
        timerActive: false,
        timerStartTime: null,
        timerDuration: 90,
        // Round 1 state
        round1Strikes: {
          red: 0,
          green: 0,
          blue: 0
        },
        round1Active: false,
        round1CurrentGuessingTeam: null
      };

      await setDoc(gameStateRef, initialState);
    }

    // Initialize teams if they don't exist
    const teams = ['red', 'green', 'blue'];
    for (const teamId of teams) {
      const teamRef = doc(db, 'teams', teamId);
      const teamDoc = await getDoc(teamRef);

      if (!teamDoc.exists()) {
        const teamData: Team = {
          id: teamId as 'red' | 'green' | 'blue',
          name: teamId.charAt(0).toUpperCase() + teamId.slice(1),
          score: 0,
          dugoutCount: 0,
          color: teamId === 'red' ? '#ef4444' : teamId === 'green' ? '#22c55e' : '#3b82f6'
        };
        await setDoc(teamRef, teamData);
      }
    }
  }

  // Update round2Options (the three questions selected for the round)
  async setRound2Options(options: string[]): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, { round2Options: options, lastUpdated: serverTimestamp() });
  }

  // Clear round2 state after round ends
  async clearRound2State(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      round2Options: [],
      round2CurrentTeam: null,
      round2UsedQuestionIds: [],
      round2State: null,
      lastUpdated: serverTimestamp(),
    });
  }

  // Listen to game state changes
  subscribeToGameState(callback: (state: GameState) => void): () => void {
    const gameStateRef = doc(db, 'gameState', 'current');

    const unsubscribe = onSnapshot(gameStateRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data() as GameState);
      }
    });

    this.listeners.set('gameState', unsubscribe);
    return unsubscribe;
  }

  // Listen to teams changes
  subscribeToTeams(callback: (teams: Team[]) => void): () => void {
    const teamsRef = collection(db, 'teams');
    const q = query(teamsRef, orderBy('id'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const teams: Team[] = [];
      querySnapshot.forEach((docSnapshot) => {
        teams.push(docSnapshot.data() as Team);
      });
      callback(teams);
    });

    this.listeners.set('teams', unsubscribe);
    return unsubscribe;
  }

  // Listen to audience members changes
  subscribeToAudienceMembers(callback: (members: AudienceMember[]) => void): () => void {
    const audienceRef = collection(db, 'audience');
    const q = query(audienceRef, orderBy('submittedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const members: AudienceMember[] = [];
      querySnapshot.forEach((docSnapshot) => {
        members.push({ id: docSnapshot.id, ...docSnapshot.data() } as AudienceMember);
      });
      callback(members);
    });

    this.listeners.set('audienceMembers', unsubscribe);
    return unsubscribe;
  }

  // Listen to current question and answers
  subscribeToCurrentQuestion(callback: (question: Question | null) => void): () => void {
    const gameStateRef = doc(db, 'gameState', 'current');
    let currentQuestionUnsubscribe: (() => void) | null = null;

    const unsubscribe = onSnapshot(gameStateRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const state = docSnapshot.data() as GameState;
        console.log('GameStateManager: Current question changed to:', state.currentQuestion);

        // Clean up previous question listener if it exists
        if (currentQuestionUnsubscribe) {
          console.log('GameStateManager: Cleaning up previous question listener');
          currentQuestionUnsubscribe();
          currentQuestionUnsubscribe = null;
        }

        if (state.currentQuestion) {
          console.log('GameStateManager: Setting up new question listener for:', state.currentQuestion);
          // Listen to the specific question document for real-time updates
          const questionRef = doc(db, 'questions', state.currentQuestion);
          currentQuestionUnsubscribe = onSnapshot(questionRef, (questionDoc) => {
            if (questionDoc.exists()) {
              const questionData = questionDoc.data() as Question;
              console.log('GameStateManager: Question data received:', questionData.id);
              console.log('GameStateManager: Question answers state:', questionData.answers.map(a => ({ id: a.id, revealed: a.revealed, attribution: a.attribution })));
              callback(questionData);
            } else {
              console.log('GameStateManager: Question document does not exist');
              callback(null);
            }
          });

          // Store the question listener for cleanup
          this.listeners.set('currentQuestion', currentQuestionUnsubscribe);
        } else {
          console.log('GameStateManager: No current question, calling callback with null');
          callback(null);
        }
      }
    });

    this.listeners.set('gameState', unsubscribe);

    // Return cleanup function that handles both listeners
    return () => {
      if (currentQuestionUnsubscribe) {
        currentQuestionUnsubscribe();
      }
      unsubscribe();
    };
  }

  // Update game state
  async updateGameState(updates: Partial<GameState>): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      ...updates,
      lastUpdated: serverTimestamp()
    });
  }

  // Update team score
  async updateTeamScore(teamId: 'red' | 'green' | 'blue', scoreChange: number): Promise<void> {
    const teamRef = doc(db, 'teams', teamId);
    const teamDoc = await getDoc(teamRef);

    if (teamDoc.exists()) {
      const currentScore = teamDoc.data().score || 0;
      await updateDoc(teamRef, {
        score: currentScore + scoreChange
      });
    }
  }

  // Reveal answer
  async revealAnswer(questionId: string, answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral', manualAmount?: number): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);

    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;
      const answerToReveal = question.answers.find(answer => answer.id === answerId);

      if (answerToReveal) {
        // ROUND 3 SPECIAL LOGIC: Check if this is the 7th (last) reveal
        const gameStateRef = doc(db, 'gameState', 'current');
        const gameStateDoc = await getDoc(gameStateRef);
        let finalValue = manualAmount !== undefined ? manualAmount : answerToReveal.value;

        if (gameStateDoc.exists()) {
          const gameState = gameStateDoc.data() as GameState;

          // If Round 3 with 7 answers, enforce 6000 for the last reveal
          if (gameState.currentRound === 'round3' && question.answers.length === 7) {
            const currentRevealedCount = question.answers.filter(a => a.revealed).length;

            // If this is the 7th reveal (6 already revealed), enforce 6000
            if (currentRevealedCount === 6) {
              finalValue = 6000;
              console.log('Round 3: Last answer revealed - enforcing value of 6000');
            }
          }
        }

        const updatedAnswers = question.answers.map(answer => {
          if (answer.id === answerId) {
            return {
              ...answer,
              revealed: true,
              attribution,
              revealedAt: new Date().toISOString(),
              value: finalValue // Will be 6000 if this is the 7th reveal in Round 3
            };
          }
          return answer;
        });

        await updateDoc(questionRef, { answers: updatedAnswers });

        // Add score to team if it's a team attribution (not host or neutral)
        if (attribution === 'red' || attribution === 'green' || attribution === 'blue') {
          await this.updateTeamScore(attribution, finalValue);
        }
      }
    }
  }

  // Hide answer
  async hideAnswer(questionId: string, answerId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);

    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;
      const answerToHide = question.answers.find(answer => answer.id === answerId);

      if (answerToHide && answerToHide.revealed && answerToHide.attribution) {
        const updatedAnswers = question.answers.map(answer => {
          if (answer.id === answerId) {
            const resetAnswer = {
              ...answer,
              revealed: false,
              attribution: null
            };
            // Remove revealedAt field entirely
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { revealedAt: _revealedAt, ...rest } = resetAnswer;
            return rest;
          }
          return answer;
        });

        await updateDoc(questionRef, { answers: updatedAnswers });

        // Remove score from team if it was a team attribution
        if (answerToHide.attribution === 'red' || answerToHide.attribution === 'green' || answerToHide.attribution === 'blue') {
          await this.updateTeamScore(answerToHide.attribution, -answerToHide.value);
        }
      }
    }
  }

  // Submit audience member with 3-layer duplicate prevention
  async submitAudienceMember(member: Omit<AudienceMember, 'id' | 'submittedAt' | 'votingRound' | 'previousTeam' | 'updatedAt'>): Promise<void> {
    // Get current voting round
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    const currentRound = gameStateDoc.exists() ? (gameStateDoc.data().votingRound || 1) : 1;

    // Normalize identifiers for consistent checking
    const normalizedPhone = member.phone.trim().toLowerCase();
    const normalizedUpi = member.upiId.trim().toLowerCase();
    const normalizedDeviceId = member.deviceId.trim();
    const normalizedAuthUid = member.authUid.trim();

    // LAYER 1: Check if device ID has already voted
    const audienceRef = collection(db, 'audience');
    const deviceQuery = query(audienceRef, where('deviceId', '==', normalizedDeviceId));
    const deviceSnapshot = await getDocs(deviceQuery);

    if (!deviceSnapshot.empty) {
      const existingVote = deviceSnapshot.docs[0].data() as AudienceMember;

      // If voting round is the same, this is a vote update
      if (existingVote.votingRound === currentRound) {
        const previousTeam = existingVote.team;
        await updateDoc(deviceSnapshot.docs[0].ref, {
          name: member.name,
          phone: normalizedPhone,
          upiId: normalizedUpi,
          authUid: normalizedAuthUid,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          team: member.team,
          previousTeam: previousTeam !== member.team ? previousTeam : null,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      } else if (currentRound > 1) {
        // Round 2+: Allow existing voters to vote again
        const previousTeam = existingVote.team;
        await updateDoc(deviceSnapshot.docs[0].ref, {
          name: member.name,
          phone: normalizedPhone,
          upiId: normalizedUpi,
          authUid: normalizedAuthUid,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          team: member.team,
          previousTeam: previousTeam,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      }
    }

    // LAYER 2: Check if phone+UPI combination has already voted
    const phoneUpiQuery = query(
      audienceRef,
      where('phone', '==', normalizedPhone),
      where('upiId', '==', normalizedUpi)
    );
    const phoneUpiSnapshot = await getDocs(phoneUpiQuery);

    if (!phoneUpiSnapshot.empty) {
      const existingVote = phoneUpiSnapshot.docs[0].data() as AudienceMember;

      if (existingVote.votingRound === currentRound) {
        const previousTeam = existingVote.team;
        await updateDoc(phoneUpiSnapshot.docs[0].ref, {
          deviceId: normalizedDeviceId,
          authUid: normalizedAuthUid,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          name: member.name,
          team: member.team,
          previousTeam: previousTeam !== member.team ? previousTeam : null,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      } else if (currentRound > 1) {
        const previousTeam = existingVote.team;
        await updateDoc(phoneUpiSnapshot.docs[0].ref, {
          deviceId: normalizedDeviceId,
          authUid: normalizedAuthUid,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          name: member.name,
          team: member.team,
          previousTeam: previousTeam,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      }
    }

    // LAYER 3: Check if auth UID has already voted
    const authQuery = query(audienceRef, where('authUid', '==', normalizedAuthUid));
    const authSnapshot = await getDocs(authQuery);

    if (!authSnapshot.empty) {
      const existingVote = authSnapshot.docs[0].data() as AudienceMember;

      if (existingVote.votingRound === currentRound) {
        const previousTeam = existingVote.team;
        await updateDoc(authSnapshot.docs[0].ref, {
          deviceId: normalizedDeviceId,
          name: member.name,
          phone: normalizedPhone,
          upiId: normalizedUpi,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          team: member.team,
          previousTeam: previousTeam !== member.team ? previousTeam : null,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      } else if (currentRound > 1) {
        const previousTeam = existingVote.team;
        await updateDoc(authSnapshot.docs[0].ref, {
          deviceId: normalizedDeviceId,
          name: member.name,
          phone: normalizedPhone,
          upiId: normalizedUpi,
          authEmail: member.authEmail,
          authProvider: member.authProvider,
          team: member.team,
          previousTeam: previousTeam,
          votingRound: currentRound,
          updatedAt: serverTimestamp()
        });
        return;
      }
    }

    // NEW VOTER - Only allowed in Round 1
    if (currentRound > 1) {
      throw new Error('New voters are only allowed in the first voting round.');
    }

    // Create new vote using deviceId as document ID
    const memberDocRef = doc(db, 'audience', normalizedDeviceId);
    await setDoc(memberDocRef, {
      deviceId: normalizedDeviceId,
      name: member.name,
      phone: normalizedPhone,
      upiId: normalizedUpi,
      authUid: normalizedAuthUid,
      authEmail: member.authEmail,
      authProvider: member.authProvider,
      team: member.team,
      submittedAt: serverTimestamp(),
      votingRound: currentRound,
      previousTeam: null,
      updatedAt: serverTimestamp()
    });
  }


  // Get audience members
  async getAudienceMembers(): Promise<AudienceMember[]> {
    const audienceRef = collection(db, 'audience');
    const q = query(audienceRef, orderBy('submittedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const members: AudienceMember[] = [];
    querySnapshot.forEach((docSnapshot) => {
      members.push({ id: docSnapshot.id, ...docSnapshot.data() } as AudienceMember);
    });

    return members;
  }

  // Export audience members to CSV
  exportAudienceToCSV(members: AudienceMember[]): string {
    // CSV header
    const headers = ['Name', 'Phone', 'UPI ID', 'Team', 'Voting Round', 'Previous Team', 'Submitted At', 'Updated At'];

    // Convert members to CSV rows
    const rows = members.map(member => {
      const submittedDate = member.submittedAt
        ? new Date(member.submittedAt as any).toLocaleString('en-IN')
        : '';
      const updatedDate = member.updatedAt
        ? new Date(member.updatedAt as any).toLocaleString('en-IN')
        : '';

      return [
        member.name,
        member.phone,
        member.upiId,
        member.team.toUpperCase(),
        member.votingRound.toString(),
        member.previousTeam ? member.previousTeam.toUpperCase() : 'NONE',
        submittedDate,
        updatedDate
      ].map(field => `"${field}"`).join(',');
    });

    // Combine header and rows
    return [headers.join(','), ...rows].join('\n');
  }

  // Download audience data as CSV file
  downloadAudienceCSV(members: AudienceMember[], filename: string = 'audience-votes.csv'): void {
    const csv = this.exportAudienceToCSV(members);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Get audience voting results and update team dugout counts
  // Changed to count unique voters per team (latest vote only)
  async updateAudienceVotingResults(): Promise<void> {
    const members = await this.getAudienceMembers();

    // Count votes per team based on LATEST votes only
    // Since we use phone as ID, each member appears only once
    const voteCounts = {
      red: 0,
      green: 0,
      blue: 0
    };

    members.forEach(member => {
      if (member.team in voteCounts) {
        voteCounts[member.team as keyof typeof voteCounts]++;
      }
    });

    // REPLACE team dugout counts (not add to existing)
    const teams = ['red', 'green', 'blue'] as const;
    for (const teamId of teams) {
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, { dugoutCount: voteCounts[teamId] });
    }
  }

  // Get team switchers - voters who changed teams in the latest voting round
  async getTeamSwitchers(): Promise<Array<{ name: string; upiId: string; previousTeam: 'red' | 'green' | 'blue'; currentTeam: 'red' | 'green' | 'blue' }>> {
    const members = await this.getAudienceMembers();

    // Filter for members who have a previousTeam set (indicating they switched)
    const switchers = members
      .filter(member => member.previousTeam !== null && member.previousTeam !== undefined)
      .map(member => ({
        name: member.name,
        upiId: member.upiId,
        previousTeam: member.previousTeam as 'red' | 'green' | 'blue',
        currentTeam: member.team
      }));

    return switchers;
  }
  // Add question
  async addQuestion(question: Question): Promise<void> {
    const questionRef = doc(db, 'questions', question.id);
    await setDoc(questionRef, question);
  }

  // Reveal all answers at once
  async revealAllAnswers(questionId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);

    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;

      const updatedAnswers = question.answers.map(answer => ({
        ...answer,
        revealed: true,
        attribution: 'neutral',
        revealedAt: new Date().toISOString()
      }));

      await updateDoc(questionRef, { answers: updatedAnswers });
    }
  }

  // Hide all answers
  async hideAllAnswers(questionId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);

    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;

      const updatedAnswers = question.answers.map(answer => {
        const resetAnswer = {
          ...answer,
          revealed: false,
          attribution: null
        };
        // Remove revealedAt field entirely
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { revealedAt: _revealedAt, ...rest } = resetAnswer;
        return rest;
      });

      await updateDoc(questionRef, { answers: updatedAnswers });
    }
  }

  // Clear all questions from the database
  async clearAllQuestions(): Promise<void> {
    console.log('GameState: Clearing all questions from Firestore...');
    const questionsCollectionRef = collection(db, 'questions');
    const querySnapshot = await getDocs(questionsCollectionRef);
    const batch = writeBatch(db);

    querySnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
    console.log(`GameState: Cleared ${querySnapshot.size} questions.`);
  }

  // Reset game
  async resetGame(): Promise<void> {
    console.log('GameStateManager: Starting game reset...');

    // Clear any cached question data first
    this.listeners.forEach((unsubscribe, key) => {
      if (key === 'currentQuestion') {
        console.log('GameStateManager: Clearing current question listener');
        unsubscribe();
        this.listeners.delete(key);
      }
    });

    // Reset game state
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      currentRound: 'pre-show',
      currentQuestion: null,
      activeTeam: null,
      bigX: false,
      scorecardOverlay: false,
      audienceWindow: false,
      round2BonusApplied: false,
      logoOnly: true,
      questionRevealed: false,
      revealMode: 'one-by-one',
      guessMode: false,
      // Voting round tracking - reset to 1
      votingRound: 1,
      // Timer state
      timerActive: false,
      timerStartTime: null,
      timerDuration: 90,
      // Round 1 state
      round1Strikes: {
        red: 0,
        green: 0,
        blue: 0
      },
      round1Active: false,
      round1CurrentGuessingTeam: null
    });
    console.log('GameState: Game state reset in Firestore.');

    // Reset team scores and dugout counts
    const teams = ['red', 'green', 'blue'];
    for (const teamId of teams) {
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, { score: 0, dugoutCount: 0 });
    }

    // Reset all questions - clear revealed answers
    console.log('GameStateManager: Resetting all questions...');
    const questionsRef = collection(db, 'questions');
    const questionsSnapshot = await getDocs(questionsRef);
    const questionUpdatePromises = questionsSnapshot.docs.map(async (docSnapshot) => {
      const question = docSnapshot.data() as Question;
      const resetAnswers = question.answers.map(answer => {
        const resetAnswer = {
          ...answer,
          revealed: false,
          attribution: null
        };
        // Remove revealedAt field entirely
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { revealedAt: _revealedAt, ...rest } = resetAnswer;
        return rest;
      });
      console.log(`GameStateManager: Resetting question ${question.id} with ${resetAnswers.length} answers`);
      return updateDoc(docSnapshot.ref, { answers: resetAnswers });
    });
    await Promise.all(questionUpdatePromises);
    console.log('GameStateManager: All questions reset completed');

    // Clear audience
    const audienceRef = collection(db, 'audience');
    const audienceSnapshot = await getDocs(audienceRef);
    const deletePromises = audienceSnapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
    await Promise.all(deletePromises);

    // Force a small delay to ensure Firebase updates are processed
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('GameStateManager: Game reset completed');
  }

  // Cleanup listeners
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }

  // ========== ROUND 1 GAMEPLAY METHODS ==========

  /**
   * Start Round 1 gameplay - initializes Round 1 state
   */
  async startRound1(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      currentRound: 'round1',
      round1Active: true,
      round1Strikes: {
        red: 0,
        green: 0,
        blue: 0
      },
      round1CurrentGuessingTeam: null,
      questionRevealed: true, // Question should be visible in Round 1
      revealMode: 'one-by-one',
      // Reset any leftover Round 2 state
      round2State: null,
      round2Options: [], // three questions selected for the round
      round2CurrentTeam: null,
      round2UsedQuestionIds: [],
      // Reset common fields
      currentQuestion: null,
      activeTeam: null,
      timerActive: false,
      lastUpdated: serverTimestamp()
    });
  }

  /**
   * Select which team is currently making a guess in Round 1
   */
  async selectRound1GuessingTeam(team: 'red' | 'green' | 'blue'): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);

    if (gameStateDoc.exists()) {
      const state = gameStateDoc.data() as GameState;

      // Allow for pre-show, round1, and round3
      const validRounds = ['pre-show', 'round1', 'round3'];
      if (validRounds.includes(state.currentRound || '')) {
        // For round1, check if team has less than 2 strikes
        if (state.currentRound === 'round1' && state.round1Active) {
          if (state.round1Strikes[team] < 2) {
            await updateDoc(gameStateRef, {
              round1CurrentGuessingTeam: team,
              activeTeam: team,
              lastUpdated: serverTimestamp()
            });
          }
        } else {
          // For pre-show and round3, just set the team (no strike checking)
          await updateDoc(gameStateRef, {
            round1CurrentGuessingTeam: team,
            activeTeam: team,
            lastUpdated: serverTimestamp()
          });
        }
      }
    }
  }

  /**
   * Evaluate a guess in Round 1 - operator marks it as correct or incorrect
   * @param isCorrect - Whether the guess was correct
   * @param matchingAnswerId - If correct, the ID of the answer that matches the guess (optional, operator can select)
   */
  async evaluateRound1Guess(
    isCorrect: boolean,
    matchingAnswerId?: string,
    manualAmount?: number
  ): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);

    if (!gameStateDoc.exists()) return;

    const state = gameStateDoc.data() as GameState;

    // Ensure a guessing team is selected and we are in a relevant round
    const validRounds = ['pre-show', 'round1', 'round3'];
    if (!validRounds.includes(state.currentRound || '') || !state.round1CurrentGuessingTeam) {
      return;
    }

    const guessingTeam = state.round1CurrentGuessingTeam;
    const currentStrikes = state.round1Strikes?.[guessingTeam] || 0;

    if (isCorrect && matchingAnswerId && state.currentQuestion) {
      // Correct guess - reveal the matching answer (same as before)
      const questionRef = doc(db, 'questions', state.currentQuestion);
      const questionDoc = await getDoc(questionRef);

      if (questionDoc.exists()) {
        const question = questionDoc.data() as Question;
        const answerToReveal = question.answers.find(a => a.id === matchingAnswerId);

        if (answerToReveal && !answerToReveal.revealed) {
          await this.revealAnswer(
            state.currentQuestion,
            matchingAnswerId,
            guessingTeam,
            manualAmount
          );
        }
      }
    } else {
      // Wrong guess - just clear guessing team (Big X is shown by control panel)
      await updateDoc(gameStateRef, {
        round1CurrentGuessingTeam: null,
        activeTeam: null,
        lastUpdated: serverTimestamp(),
      });
    }

    console.log('Control: Guess evaluated');
  }

  /**
   * Manually end Round 1 (operator can force end)
   */
  async endRound1(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      round1Active: false,
      round1CurrentGuessingTeam: null,
      activeTeam: null,
      lastUpdated: serverTimestamp()
    });
  }

  /**
   * Reset Round 1 strikes (useful for restarting Round 1)
   */
  async resetRound1Strikes(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      round1Strikes: {
        red: 0,
        green: 0,
        blue: 0
      },
      round1CurrentGuessingTeam: null,
      lastUpdated: serverTimestamp()
    });
  }

  // ========== ROUND 2 GAMEPLAY METHODS ==========

  /**
   * Start Round 2 - Initialize Round 2 state
   */
  async startRound2(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      currentRound: 'round2',
      round2State: {
        phase: 'selection',
        availableQuestionIds: [],
        activeQuestionId: null,
        timerDuration: 90
      },
      round2CurrentTeam: null, // Initialize with no team selected
      round2UsedQuestionIds: [], // Initialize empty array for tracking
      // Reset common state
      currentQuestion: null,
      activeTeam: null,
      timerActive: false,
      questionRevealed: false,
      revealMode: 'one-by-one',
      lastUpdated: serverTimestamp()
    });
  }

  /**
   * Select which team is playing Round 2
   */
  async selectRound2Team(team: 'red' | 'green' | 'blue'): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);

    if (gameStateDoc.exists()) {
      const state = gameStateDoc.data() as GameState;

      if (state.currentRound === 'round2') {
        await updateDoc(gameStateRef, {
          round2CurrentTeam: team,
          activeTeam: team, // Set activeTeam for scoring
          lastUpdated: serverTimestamp()
        });
      }
    }
  }


  /**
 * Set available questions for Round 2 selection phase
 */
  async setRound2AvailableQuestions(questionIds: string[]): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);

    if (gameStateDoc.exists()) {
      const state = gameStateDoc.data() as GameState;

      // Filter out questions already used by other teams
      const usedQuestions = state.round2UsedQuestionIds || [];
      const availableQuestions = questionIds.filter(id => !usedQuestions.includes(id));

      await updateDoc(gameStateRef, {
        'round2State.availableQuestionIds': availableQuestions.slice(0, 3), // Take first 3 available
        'round2State.phase': 'selection',
        lastUpdated: serverTimestamp()
      });
    }
  }

  /**
   * Select a question in Round 2 to play
   */
  async selectRound2Question(questionId: string): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');

    // Reset the question's answers to original hidden state before using it in Round 2
    await this.hideAllAnswers(questionId);

    // Also set this as the main currentQuestion so other components can use it
    await updateDoc(gameStateRef, {
      'round2State.activeQuestionId': questionId,
      'round2State.phase': 'question',
      currentQuestion: questionId,
      questionRevealed: true, // Show the question text
      revealMode: 'one-by-one', // Answers hidden initially
      lastUpdated: serverTimestamp()
    });
  }

  /**
 * Start Round 2 Timer (60s)
 */
  async startRound2Timer(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      timerActive: true,
      timerStartTime: Date.now(),
      timerDuration: 90,
      lastUpdated: serverTimestamp()
    });
  }

  /**
 * End Round 2 Timer - Just stops the timer without resetting state
 */
  async endRound2Timer(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      timerActive: false,
      timerStartTime: null,
      lastUpdated: serverTimestamp()
    });
  }


  /**
   * Get specific questions by IDs (for Round 2 selection display)
   */
  async getQuestionsByIds(ids: string[]): Promise<Question[]> {
    if (!ids || ids.length === 0) return [];

    const questions: Question[] = [];
    // Firestore 'in' query is limited to 10 items, which is fine for 3 items
    const q = query(collection(db, 'questions'), where(documentId(), 'in', ids));

    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnapshot) => {
      questions.push({
        id: docSnapshot.id,
        ...docSnapshot.data()
      } as Question);
    });

    return questions;
  }
}

export const gameStateManager = GameStateManager.getInstance();

