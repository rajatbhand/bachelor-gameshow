import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  getDocs
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
  round2BonusApplied: boolean;
  logoOnly: boolean;
  lastUpdated: unknown;
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
  id: string;
  name: string;
  phone: string;
  team: 'red' | 'green' | 'blue';
  submittedAt: unknown;
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
        round2BonusApplied: false,
        logoOnly: true,
        lastUpdated: serverTimestamp()
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

  // Listen to current question and answers
  subscribeToCurrentQuestion(callback: (question: Question | null) => void): () => void {
    const gameStateRef = doc(db, 'gameState', 'current');
    
    const unsubscribe = onSnapshot(gameStateRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const state = docSnapshot.data() as GameState;
        if (state.currentQuestion) {
          const questionRef = doc(db, 'questions', state.currentQuestion);
          const questionDoc = await getDoc(questionRef);
          if (questionDoc.exists()) {
            callback(questionDoc.data() as Question);
          } else {
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    });

    this.listeners.set('currentQuestion', unsubscribe);
    return unsubscribe;
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
  async revealAnswer(questionId: string, answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral'): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    
    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;
      const updatedAnswers = question.answers.map(answer => {
        if (answer.id === answerId) {
          return {
            ...answer,
            revealed: true,
            attribution,
            revealedAt: serverTimestamp()
          };
        }
        return answer;
      });
      
      await updateDoc(questionRef, { answers: updatedAnswers });
    }
  }

  // Hide answer
  async hideAnswer(questionId: string, answerId: string): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    
    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;
      const updatedAnswers = question.answers.map(answer => {
        if (answer.id === answerId) {
          return {
            ...answer,
            revealed: false,
            attribution: null,
            revealedAt: null
          };
        }
        return answer;
      });
      
      await updateDoc(questionRef, { answers: updatedAnswers });
    }
  }

  // Submit audience member
  async submitAudienceMember(member: Omit<AudienceMember, 'id' | 'submittedAt'>): Promise<void> {
    await addDoc(collection(db, 'audience'), {
      ...member,
      submittedAt: serverTimestamp()
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

  // Apply Round 2 bonus
  async applyRound2Bonus(): Promise<void> {
    const gameStateRef = doc(db, 'gameState', 'current');
    const gameStateDoc = await getDoc(gameStateRef);
    
    if (gameStateDoc.exists()) {
      const state = gameStateDoc.data() as GameState;
      if (state.currentQuestion) {
        const questionRef = doc(db, 'questions', state.currentQuestion);
        const questionDoc = await getDoc(questionRef);
        
        if (questionDoc.exists()) {
          const question = questionDoc.data() as Question;
          const correctAnswers = question.answers.filter(a => 
            a.revealed && (a.attribution === 'red' || a.attribution === 'green' || a.attribution === 'blue')
          );
          
          if (correctAnswers.length >= 3) {
            const multiplier = correctAnswers.length >= 4 ? 3 : 2;
            const totalBonus = correctAnswers.reduce((sum, answer) => sum + answer.value, 0) * multiplier;
            
            // Apply bonus to active team
            if (state.activeTeam && state.activeTeam !== 'host') {
              await this.updateTeamScore(state.activeTeam, totalBonus);
            }
            
            await this.updateGameState({ round2BonusApplied: true });
          }
        }
      }
    }
  }

  // Add question
  async addQuestion(question: Question): Promise<void> {
    const questionRef = doc(db, 'questions', question.id);
    await setDoc(questionRef, question);
  }

  // Reset game
  async resetGame(): Promise<void> {
    // Reset game state
    await this.updateGameState({
      currentRound: 'pre-show',
      currentQuestion: null,
      activeTeam: null,
      bigX: false,
      scorecardOverlay: false,
      audienceWindow: false,
      round2BonusApplied: false,
      logoOnly: true
    });

    // Reset team scores
    const teams = ['red', 'green', 'blue'];
    for (const teamId of teams) {
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, { score: 0, dugoutCount: 0 });
    }

    // Clear audience
    const audienceRef = collection(db, 'audience');
    const audienceSnapshot = await getDocs(audienceRef);
    const deletePromises = audienceSnapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
    await Promise.all(deletePromises);
  }

  // Cleanup listeners
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

export const gameStateManager = GameStateManager.getInstance();
