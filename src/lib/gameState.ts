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
              console.log('GameStateManager: Question data received:', questionDoc.data()?.id);
              callback(questionDoc.data() as Question);
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
  async revealAnswer(questionId: string, answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral'): Promise<void> {
    const questionRef = doc(db, 'questions', questionId);
    const questionDoc = await getDoc(questionRef);
    
    if (questionDoc.exists()) {
      const question = questionDoc.data() as Question;
      const answerToReveal = question.answers.find(answer => answer.id === answerId);
      
      if (answerToReveal) {
        const updatedAnswers = question.answers.map(answer => {
          if (answer.id === answerId) {
            return {
              ...answer,
              revealed: true,
              attribution,
              revealedAt: new Date().toISOString()
            };
          }
          return answer;
        });
        
        await updateDoc(questionRef, { answers: updatedAnswers });
        
        // Add score to team if it's a team attribution (not host or neutral)
        if (attribution === 'red' || attribution === 'green' || attribution === 'blue') {
          await this.updateTeamScore(attribution, answerToReveal.value);
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
            return {
              ...answer,
              revealed: false,
              attribution: null,
              revealedAt: undefined
            };
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

  // Get audience voting results and update team dugout counts
  async updateAudienceVotingResults(): Promise<void> {
    const members = await this.getAudienceMembers();
    
    // Count votes per team
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
    
    // Update team dugout counts
    const teams = ['red', 'green', 'blue'] as const;
    for (const teamId of teams) {
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, { dugoutCount: voteCounts[teamId] });
    }
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

    // Reset all questions - clear revealed answers
    const questionsRef = collection(db, 'questions');
    const questionsSnapshot = await getDocs(questionsRef);
    const questionUpdatePromises = questionsSnapshot.docs.map(async (docSnapshot) => {
      const question = docSnapshot.data() as Question;
      const resetAnswers = question.answers.map(answer => ({
        ...answer,
        revealed: false,
        attribution: null,
        revealedAt: undefined
      }));
      return updateDoc(docSnapshot.ref, { answers: resetAnswers });
    });
    await Promise.all(questionUpdatePromises);

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
