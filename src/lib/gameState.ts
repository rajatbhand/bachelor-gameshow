import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
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

export type TeamColor = 'red' | 'green' | 'blue';
/** '3-horse' = the classic red/green/blue show. '2v2' = two teams the operator picks. */
export type TeamMode = '3-horse' | '2v2';

export const TEAM_COLORS: TeamColor[] = ['red', 'green', 'blue'];

/**
 * One row of the "Game Timeline" sheet in the exported workbook. Rows are
 * appended to the `gameState/timeline` document as the show runs.
 *
 * The timeline lives in its OWN document rather than inside gameState/current:
 * it grows all show, and every listener re-downloads a document on each change,
 * so parking it here keeps the hot game-state document small.
 */
export interface TimelineEvent {
  seq: number;
  ts: number;
  round: string;
  type: string;
  label: string;
  team: TeamColor | 'host' | 'neutral' | null;
  questionId: string | null;
  answerId: string | null;
  detail: string;
  points: number | null;
  scores: Record<TeamColor, number>;
}

/** Cap so a long show can never push the timeline document near Firestore's 1 MB limit. */
export const TIMELINE_MAX = 2000;

/** The Round 3 prize bucket every episode opens with. */
export const ROUND3_START_BUCKET = 6000;

// Game State Types
export interface GameState {
  currentRound: 'pre-show' | 'round1' | 'round2' | 'round3' | 'final' | 'brand';
  currentQuestion: string | null;
  activeTeam: 'red' | 'green' | 'blue' | 'host' | null;
  bigX: boolean;
  scorecardOverlay: boolean;
  voteShiftOverlay: boolean;
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
  // End show state
  showEndScreen: boolean; // Whether to show the end show thank you screen
  // Brand Section State
  activeBrandQuestionId?: string | null;
  // Round 3 prize bucket (accumulated from wrong-answer penalties)
  round3BucketTotal?: number;
  // Team configuration — which format this episode runs and which horses are in
  // play. Every team list in the UI is driven off activeTeams, so a 2v2 episode
  // simply shows two horses everywhere.
  teamMode?: TeamMode;
  activeTeams?: TeamColor[];
  /**
   * Derived audience figures for the big screen, written by the operator when
   * the votes are recounted. Lets the display render the submission count and
   * vote-shift overlay WITHOUT reading the `audience` collection, which holds
   * every voter's phone number and UPI id.
   */
  audienceSummary?: {
    count: number;
    switchers: Array<{
      name: string;
      upiId: string;
      previousTeam: TeamColor;
      currentTeam: TeamColor;
    }>;
  };
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
  displayText?: string; // Optional teaser text for Round 2 selection phase
  answers: Answer[];
  answerCount: number;
}

export interface BrandQuestion {
  id: string;
  text: string;
  // Brand questions have no options/answers
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
        voteShiftOverlay: false,
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
        round1CurrentGuessingTeam: null,
        // End show state
        showEndScreen: false,
        // Team format — defaults to the classic three horses
        teamMode: '3-horse',
        activeTeams: [...TEAM_COLORS],
        round3BucketTotal: ROUND3_START_BUCKET
      };

      await setDoc(gameStateRef, initialState);
    } else if (!gameStateDoc.data()?.activeTeams) {
      // Backfill for games created before 2v2 existed.
      await updateDoc(gameStateRef, { teamMode: '3-horse', activeTeams: [...TEAM_COLORS] });
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

  // ========== SHOW TIMELINE ==========

  /**
   * Append one row to the show timeline (`gameState/timeline`).
   *
   * Fire-and-forget on purpose: the timeline is a recording of the show, and a
   * failed write must never block or break the show itself. Scores are read
   * fresh so each row carries the running totals the room actually saw.
   */
  async recordEvent(input: {
    type: string;
    label: string;
    team?: TimelineEvent['team'];
    questionId?: string | null;
    answerId?: string | null;
    detail?: string;
    points?: number | null;
  }): Promise<void> {
    try {
      const timelineRef = doc(db, 'gameState', 'timeline');
      const [timelineDoc, gameStateDoc, teamsSnapshot] = await Promise.all([
        getDoc(timelineRef),
        getDoc(doc(db, 'gameState', 'current')),
        getDocs(collection(db, 'teams'))
      ]);

      const scores: Record<TeamColor, number> = { red: 0, green: 0, blue: 0 };
      teamsSnapshot.forEach((teamDoc) => {
        const team = teamDoc.data() as Team;
        if (team.id in scores) scores[team.id] = team.score ?? 0;
      });

      const existing = timelineDoc.exists()
        ? ((timelineDoc.data().events ?? []) as TimelineEvent[])
        : [];
      const seq = (timelineDoc.exists() ? (timelineDoc.data().seq ?? 0) : 0) + 1;

      const event: TimelineEvent = {
        seq,
        ts: Date.now(),
        round: gameStateDoc.exists() ? (gameStateDoc.data().currentRound ?? '') : '',
        type: input.type,
        label: input.label,
        team: input.team ?? null,
        questionId: input.questionId ?? null,
        answerId: input.answerId ?? null,
        detail: input.detail ?? '',
        points: input.points ?? null,
        scores
      };

      const events = [...existing, event];
      await setDoc(timelineRef, {
        events: events.length > TIMELINE_MAX ? events.slice(-TIMELINE_MAX) : events,
        seq
      });
    } catch (error) {
      console.error('Timeline: could not record event', input.type, error);
    }
  }

  async getTimeline(): Promise<TimelineEvent[]> {
    const timelineDoc = await getDoc(doc(db, 'gameState', 'timeline'));
    return timelineDoc.exists() ? ((timelineDoc.data().events ?? []) as TimelineEvent[]) : [];
  }

  subscribeToTimeline(callback: (events: TimelineEvent[]) => void): () => void {
    const unsubscribe = onSnapshot(doc(db, 'gameState', 'timeline'), (snapshot) => {
      callback(snapshot.exists() ? ((snapshot.data().events ?? []) as TimelineEvent[]) : []);
    });
    this.listeners.set('timeline', unsubscribe);
    return unsubscribe;
  }

  async clearTimeline(): Promise<void> {
    await setDoc(doc(db, 'gameState', 'timeline'), { events: [], seq: 0 });
  }

  // ========== TEAM FORMAT (3 horses vs 2v2) ==========

  /**
   * Switch the episode format. Colors dropped from play keep their scores (so
   * switching back mid-show loses nothing) but vanish from the control panel,
   * the display and the audience voting screen.
   */
  async setTeamMode(mode: TeamMode, activeTeams: TeamColor[]): Promise<void> {
    const next = mode === '3-horse' ? [...TEAM_COLORS] : activeTeams;
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    const state = gameStateDoc.exists() ? (gameStateDoc.data() as GameState) : null;

    const updates: Record<string, unknown> = {
      teamMode: mode,
      activeTeams: next,
      lastUpdated: serverTimestamp()
    };
    // A team that just left play can't stay selected anywhere.
    if (state?.round1CurrentGuessingTeam && !next.includes(state.round1CurrentGuessingTeam)) {
      updates.round1CurrentGuessingTeam = null;
    }
    if (state?.round2CurrentTeam && !next.includes(state.round2CurrentTeam)) {
      updates.round2CurrentTeam = null;
    }
    if (
      state?.activeTeam &&
      state.activeTeam !== 'host' &&
      !next.includes(state.activeTeam as TeamColor)
    ) {
      updates.activeTeam = null;
    }

    await updateDoc(gameStateRef, updates);
    void this.recordEvent({
      type: 'team_mode',
      label: mode === '2v2' ? 'Format set to 2v2' : 'Format set to 3 horses',
      detail: next.map((c) => c.toUpperCase()).join(' vs ')
    });
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

  /**
   * Listen to the horses IN PLAY, in screen order.
   *
   * This is the single lever that makes 2v2 work everywhere: it watches both the
   * team documents and `activeTeams` on the game state, and only emits the teams
   * the episode is actually running. Every page that maps over this list — the
   * control panel, the display, the audience voting screen — shrinks to two
   * horses without knowing anything about the format.
   */
  subscribeToTeams(callback: (teams: Team[]) => void): () => void {
    const teamOrder = ['green', 'blue', 'red'];
    let allTeams: Team[] = [];
    let activeTeams: TeamColor[] = [...TEAM_COLORS];

    const emit = () => {
      const filtered = allTeams
        .filter((team) => activeTeams.includes(team.id))
        .sort((a, b) => teamOrder.indexOf(a.id) - teamOrder.indexOf(b.id));
      callback(filtered);
    };

    const unsubscribeTeams = onSnapshot(query(collection(db, 'teams')), (querySnapshot) => {
      allTeams = [];
      querySnapshot.forEach((docSnapshot) => {
        allTeams.push(docSnapshot.data() as Team);
      });
      emit();
    });

    const unsubscribeState = onSnapshot(doc(db, 'gameState', 'current'), (snapshot) => {
      if (!snapshot.exists()) return;
      const next = (snapshot.data() as GameState).activeTeams;
      activeTeams = next && next.length ? next : [...TEAM_COLORS];
      emit();
    });

    const unsubscribe = () => {
      unsubscribeTeams();
      unsubscribeState();
    };
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

  // Subscribe to current brand question
  subscribeToBrandQuestion(callback: (question: BrandQuestion | null) => void): () => void {
    const gameStateRef = doc(db, 'gameState', 'current');
    let currentQuestionUnsubscribe: (() => void) | null = null;

    const unsubscribe = onSnapshot(gameStateRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const state = docSnapshot.data() as GameState;

        // Clean up previous listener
        if (currentQuestionUnsubscribe) {
          currentQuestionUnsubscribe();
          currentQuestionUnsubscribe = null;
        }

        if (state.activeBrandQuestionId && state.currentRound === 'brand') {
          console.log('GameStateManager: Setting up Brand question listener for:', state.activeBrandQuestionId);
          const questionRef = doc(db, 'brand_questions', state.activeBrandQuestionId);

          currentQuestionUnsubscribe = onSnapshot(questionRef, (questionDoc) => {
            if (questionDoc.exists()) {
              const questionData = questionDoc.data() as BrandQuestion;
              callback(questionData);
            } else {
              callback(null);
            }
          });

          this.listeners.set('activeBrandQuestion', currentQuestionUnsubscribe);
        } else {
          callback(null);
        }
      }
    });

    // Track main listener too
    this.listeners.set('brandGameState', unsubscribe);

    return () => {
      if (currentQuestionUnsubscribe) {
        currentQuestionUnsubscribe();
      }
      unsubscribe();
    };
  }

  /** Put a question on the board (resets its answers first) and record it. */
  async selectQuestion(questionId: string): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    const currentRound = gameStateDoc.exists() ? gameStateDoc.data().currentRound : '';
    const shouldReveal = ['round1', 'round3', 'pre-show'].includes(currentRound || '');

    await this.hideAllAnswers(questionId);
    await updateDoc(gameStateRef, {
      currentQuestion: questionId,
      questionRevealed: shouldReveal,
      revealMode: 'one-by-one',
      guessMode: false,
      lastUpdated: serverTimestamp()
    });

    const questionDoc = await getDoc(doc(db, 'questions', questionId));
    void this.recordEvent({
      type: 'question_selected',
      label: 'Question on board',
      questionId,
      detail: questionDoc.exists() ? (questionDoc.data() as Question).text : questionId
    });
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
        const finalValue = manualAmount !== undefined ? manualAmount : answerToReveal.value;

        const updatedAnswers = question.answers.map(answer => {
          if (answer.id === answerId) {
            return {
              ...answer,
              revealed: true,
              attribution,
              revealedAt: new Date().toISOString(),
              value: finalValue
            };
          }
          return answer;
        });

        await updateDoc(questionRef, { answers: updatedAnswers });

        // Add score to team if it's a team attribution (not host or neutral)
        const scoring = attribution === 'red' || attribution === 'green' || attribution === 'blue';
        if (scoring) {
          await this.updateTeamScore(attribution, finalValue);
        }

        void this.recordEvent({
          type: 'answer_revealed',
          label: scoring ? 'Answer revealed (scored)' : 'Answer revealed',
          team: attribution,
          questionId,
          answerId,
          detail: `"${answerToReveal.text}"`,
          points: scoring ? finalValue : 0
        });
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
        const scored =
          answerToHide.attribution === 'red' ||
          answerToHide.attribution === 'green' ||
          answerToHide.attribution === 'blue';
        if (scored) {
          await this.updateTeamScore(answerToHide.attribution as TeamColor, -answerToHide.value);
        }

        void this.recordEvent({
          type: 'answer_hidden',
          label: 'Answer un-revealed',
          team: answerToHide.attribution,
          questionId,
          answerId,
          detail: `"${answerToHide.text}"`,
          points: scored ? -answerToHide.value : 0
        });
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


  /**
   * Fetch just this voter's own record.
   *
   * The audience screen used to pull the whole collection and search it for
   * itself, which required every phone to be able to read every other voter's
   * contact details. Querying on authUid keeps it to one document and matches
   * the `audience` read rule exactly, so Firestore can prove the query is safe.
   */
  async getMyVote(authUid: string): Promise<AudienceMember | null> {
    const audienceRef = collection(db, 'audience');
    const snapshot = await getDocs(query(audienceRef, where('authUid', '==', authUid)));
    if (snapshot.empty) return null;
    const docSnapshot = snapshot.docs[0];
    return { id: docSnapshot.id, ...docSnapshot.data() } as AudienceMember;
  }

  /** Live view of this voter's own record (drives the confirmation screen). */
  subscribeToMyVote(authUid: string, callback: (member: AudienceMember | null) => void): () => void {
    const q = query(collection(db, 'audience'), where('authUid', '==', authUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      const docSnapshot = snapshot.docs[0];
      callback({ id: docSnapshot.id, ...docSnapshot.data() } as AudienceMember);
    });
    this.listeners.set('myVote', unsubscribe);
    return unsubscribe;
  }

  // Get audience members (operator only — see firestore.rules)
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
        ? new Date(member.submittedAt as string | number).toLocaleString('en-IN')
        : '';
      const updatedDate = member.updatedAt
        ? new Date(member.updatedAt as string | number).toLocaleString('en-IN')
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

  /**
   * Recount the dugouts from the current votes and publish the summary the big
   * screen needs.
   *
   * The display used to read the whole `audience` collection just to show a
   * submission count and the vote-shift list. That is the collection holding
   * every voter's phone number and UPI id, so it can no longer be world-
   * readable (see firestore.rules). Instead the operator — who has already read
   * those documents — writes the derived summary into `gameState/current`,
   * which is safe to publish: names and the horses moved between, no contact
   * details beyond what the overlay puts on screen anyway.
   */
  async updateAudienceVotingResults(): Promise<void> {
    const members = await this.getAudienceMembers();

    // Count votes per team based on LATEST votes only
    // Since we use deviceId as ID, each member appears only once
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

    await updateDoc(doc(db, 'gameState', 'current'), {
      audienceSummary: {
        count: members.length,
        switchers: members
          .filter(m => m.previousTeam != null && m.previousTeam !== m.team)
          .map(m => ({
            name: m.name,
            upiId: m.upiId,
            previousTeam: m.previousTeam as TeamColor,
            currentTeam: m.team
          }))
      },
      lastUpdated: serverTimestamp()
    });
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

  // Add brand question
  async addBrandQuestion(question: BrandQuestion): Promise<void> {
    const questionRef = doc(db, 'brand_questions', question.id);
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
      void this.recordEvent({
        type: 'answers_revealed_all',
        label: 'All answers revealed',
        questionId,
        detail: question.text
      });
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

  /**
   * Live-edit one answer while the show is running.
   *
   * If the answer is already revealed AND was scored to a team, the change in
   * value is applied to that team's score as a delta — otherwise the board and
   * the scoreboard would silently disagree.
   */
  async updateAnswer(
    questionId: string,
    answerId: string,
    updates: { text?: string; value?: number }
  ): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    if (!questionDoc.exists()) return;

    const question = questionDoc.data() as Question;
    const before = question.answers.find(answer => answer.id === answerId);
    if (!before) return;

    const updatedAnswers = question.answers.map(answer =>
      answer.id === answerId ? { ...answer, ...updates } : answer
    );
    await updateDoc(questionRef, { answers: updatedAnswers });

    const nextValue = updates.value ?? before.value;
    const delta = nextValue - before.value;
    const scored =
      before.revealed &&
      (before.attribution === 'red' || before.attribution === 'green' || before.attribution === 'blue');
    if (scored && delta !== 0) {
      await this.updateTeamScore(before.attribution as TeamColor, delta);
    }

    void this.recordEvent({
      type: 'answer_edited',
      label: scored && delta !== 0 ? 'Answer edited live (score adjusted)' : 'Answer edited live',
      team: scored ? before.attribution : null,
      questionId,
      answerId,
      detail: `"${updates.text ?? before.text}" @ ${nextValue}`,
      points: scored && delta !== 0 ? delta : null
    });
  }

  /** Live-edit a question's wording (and optional Round 2 teaser). */
  async updateQuestionText(
    questionId: string,
    text: string,
    displayText?: string
  ): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    if (!questionDoc.exists()) return;

    const updates: Record<string, unknown> = { text };
    if (displayText !== undefined) {
      updates.displayText = displayText.trim() ? displayText.trim() : deleteField();
    }
    await updateDoc(questionRef, updates);

    void this.recordEvent({
      type: 'question_edited',
      label: 'Question text edited live',
      questionId,
      detail: text
    });
  }

  /** Add an answer to a question mid-show. */
  async addAnswer(questionId: string, text: string, value: number): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    if (!questionDoc.exists()) return;

    const question = questionDoc.data() as Question;
    const answer: Answer = {
      id: `${questionId}_answer_${Date.now()}`,
      text,
      value,
      revealed: false,
      attribution: null
    };
    const answers = [...question.answers, answer];
    await updateDoc(questionRef, { answers, answerCount: answers.length });

    void this.recordEvent({
      type: 'answer_added',
      label: 'Answer added live',
      questionId,
      answerId: answer.id,
      detail: `"${text}" @ ${value}`
    });
  }

  /** Remove an answer. A revealed+scored answer gives its points back first. */
  async deleteAnswer(questionId: string, answerId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    if (!questionDoc.exists()) return;

    const question = questionDoc.data() as Question;
    const answer = question.answers.find(a => a.id === answerId);
    if (!answer) return;

    const answers = question.answers.filter(a => a.id !== answerId);
    await updateDoc(questionRef, { answers, answerCount: answers.length });

    const scored =
      answer.revealed &&
      (answer.attribution === 'red' || answer.attribution === 'green' || answer.attribution === 'blue');
    if (scored) {
      await this.updateTeamScore(answer.attribution as TeamColor, -answer.value);
    }

    void this.recordEvent({
      type: 'answer_deleted',
      label: scored ? 'Answer deleted live (score returned)' : 'Answer deleted live',
      team: scored ? answer.attribution : null,
      questionId,
      answerId,
      detail: `"${answer.text}"`,
      points: scored ? -answer.value : null
    });
  }

  /** Delete a whole question from the bank mid-show. */
  async deleteQuestion(questionId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    if (!questionDoc.exists()) return;
    const question = questionDoc.data() as Question;

    await deleteDoc(questionRef);

    // Clear it out of anywhere the game still points at it.
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    if (gameStateDoc.exists()) {
      const state = gameStateDoc.data() as GameState;
      const updates: Record<string, unknown> = { lastUpdated: serverTimestamp() };
      if (state.currentQuestion === questionId) {
        updates.currentQuestion = null;
        updates.questionRevealed = false;
      }
      if ((state.round2Options || []).includes(questionId)) {
        updates.round2Options = (state.round2Options || []).filter(id => id !== questionId);
      }
      if (Object.keys(updates).length > 1) await updateDoc(gameStateRef, updates);
    }

    void this.recordEvent({
      type: 'question_deleted',
      label: 'Question deleted',
      questionId,
      detail: question.text
    });
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

  // Clear all BRAND questions
  async clearAllBrandQuestions(): Promise<void> {
    console.log('GameState: Clearing all brand questions from Firestore...');
    const questionsCollectionRef = collection(db, 'brand_questions');
    const querySnapshot = await getDocs(questionsCollectionRef);
    const batch = writeBatch(db);

    querySnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
    console.log(`GameState: Cleared ${querySnapshot.size} brand questions.`);
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
      voteShiftOverlay: false,
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
      round1CurrentGuessingTeam: null,
      // Round 2 state - CLEAR ALL ROUND 2 FIELDS
      round2Options: [],
      round2UsedQuestionIds: [],
      round2State: null,
      round2CurrentTeam: null,
      // End show state
      showEndScreen: false,
      // Brand state
      activeBrandQuestionId: null,
      // Round 3 prize bucket back to the standard opening figure
      round3BucketTotal: ROUND3_START_BUCKET
    });
    console.log('GameState: Game state reset in Firestore (including Round 2 fields)');

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

    // Wipe the show timeline and open a fresh one with the reset as row 1.
    await this.clearTimeline();
    await this.recordEvent({
      type: 'game_reset',
      label: 'GAME RESET',
      detail: 'scores, reveals, votes and timeline cleared'
    });

    // Force a small delay to ensure Firebase updates are processed
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('GameStateManager: Game reset completed');
  }

  /**
   * Open or close audience voting.
   *
   * Closing bumps the voting round (so the next open is a fresh round) and
   * re-counts the dugouts, in one place — the control panel used to do this
   * inline and it is easy to get half-done.
   */
  async setAudienceWindow(open: boolean): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    const state = gameStateDoc.exists() ? (gameStateDoc.data() as GameState) : null;

    if (open) {
      await updateDoc(gameStateRef, { audienceWindow: true, lastUpdated: serverTimestamp() });
      void this.recordEvent({
        type: 'voting_open',
        label: 'Audience voting OPENED',
        detail: `round ${state?.votingRound ?? 1}`
      });
      return;
    }

    await updateDoc(gameStateRef, {
      audienceWindow: false,
      votingRound: (state?.votingRound ?? 1) + 1,
      lastUpdated: serverTimestamp()
    });
    await this.updateAudienceVotingResults();

    const members = await this.getAudienceMembers();
    const counts: Record<string, number> = {};
    for (const color of state?.activeTeams ?? TEAM_COLORS) counts[color] = 0;
    for (const member of members) {
      if (counts[member.team] !== undefined) counts[member.team]++;
    }
    void this.recordEvent({
      type: 'voting_closed',
      label: 'Audience voting CLOSED',
      detail: Object.entries(counts)
        .map(([team, n]) => `${team.toUpperCase()}: ${n}`)
        .join(', ')
    });
  }

  /** Manual score nudge from the control panel (recorded on the timeline). */
  async adjustScore(teamId: TeamColor, delta: number): Promise<void> {
    await this.updateTeamScore(teamId, delta);
    void this.recordEvent({
      type: 'score_adjusted',
      label: 'Manual score change',
      team: teamId,
      detail: `${delta >= 0 ? '+' : ''}${delta}`,
      points: delta
    });
  }

  /** Round 3 wrong answer: the team pays a penalty into the shared bucket. */
  async applyRound3Penalty(teamId: TeamColor, penalty: number): Promise<number> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    const bucket = ((gameStateDoc.data()?.round3BucketTotal as number) ?? 0) + penalty;

    await this.updateTeamScore(teamId, -penalty);
    await updateDoc(gameStateRef, { round3BucketTotal: bucket, lastUpdated: serverTimestamp() });

    void this.recordEvent({
      type: 'round3_penalty',
      label: 'Round 3 penalty to bucket',
      team: teamId,
      detail: `bucket now ₹${bucket}`,
      points: -penalty
    });
    return bucket;
  }

  // Cleanup listeners
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }

  // ========== ROUND 1 GAMEPLAY METHODS ==========

  /**
   * Start Pre-Show - Initialize Pre-Show state
   */
  async startPreShow(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      currentRound: 'pre-show',
      // Reset common fields that might persist
      round1CurrentGuessingTeam: null,
      round2CurrentTeam: null,
      activeTeam: null,
      questionRevealed: true, // Visible for pre-show
      revealMode: 'one-by-one',
      // Ensure Round 2 options are cleared
      round2Options: [],
      round2State: null,
      timerActive: false,
      lastUpdated: serverTimestamp()
    });
    void this.recordEvent({ type: 'round_start', label: 'Pre-Show started' });
  }

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
    void this.recordEvent({ type: 'round_start', label: 'Round 1 started' });
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
            void this.recordEvent({ type: 'turn', label: 'Team on the buzzer', team, questionId: state.currentQuestion });
          }
        } else {
          // For pre-show and round3, just set the team (no strike checking)
          await updateDoc(gameStateRef, {
            round1CurrentGuessingTeam: team,
            activeTeam: team,
            lastUpdated: serverTimestamp()
          });
          void this.recordEvent({ type: 'turn', label: 'Team on the buzzer', team, questionId: state.currentQuestion });
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
      void this.recordEvent({
        type: 'guess_wrong',
        label: 'Wrong guess (Big X)',
        team: guessingTeam,
        questionId: state.currentQuestion,
        points: 0
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
      round1CurrentGuessingTeam: null, // Ensure Round 1 team selection is cleared
      currentQuestion: null,
      activeTeam: null,
      timerActive: false,
      questionRevealed: false,
      revealMode: 'one-by-one',
      lastUpdated: serverTimestamp()
    });
    void this.recordEvent({ type: 'round_start', label: 'Round 2 started' });
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
          round1CurrentGuessingTeam: null, // Double check: ensure Round 1 team is cleared
          lastUpdated: serverTimestamp()
        });
        void this.recordEvent({ type: 'turn', label: 'Team playing Round 2', team });
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
        'round2State.availableQuestionIds': availableQuestions, // Take first 3 available
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
  async startRound2Timer(duration: number = 90): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      timerActive: true,
      timerStartTime: Date.now(),
      timerDuration: duration,
      lastUpdated: serverTimestamp()
    });
    void this.recordEvent({ type: 'timer_start', label: 'Timer started', detail: `${duration}s` });
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
    void this.recordEvent({ type: 'timer_stop', label: 'Timer stopped' });
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

  /**
   * Start Round 3 - Initialize Round 3 state
   */
  async startRound3(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    await updateDoc(gameStateRef, {
      currentRound: 'round3',
      round1CurrentGuessingTeam: null, // Clear any previous Round 1/Pre-show guessing team
      round2CurrentTeam: null, // Clear any Round 2 team
      activeTeam: null,
      questionRevealed: true, // Questions visible by default in Round 3
      revealMode: 'one-by-one',
      // Ensure Round 2 options are cleared so they don't linger
      round2Options: [],
      round2State: null,
      lastUpdated: serverTimestamp()
    });
    void this.recordEvent({ type: 'round_start', label: 'Round 3 started' });
  }
}

export const gameStateManager = GameStateManager.getInstance();

