'use client';

import { useEffect, useState, useRef } from 'react';
import {
  gameStateManager,
  GameState,
  Team,
  Question,
  BrandQuestion,
  AudienceMember,
  TimelineEvent,
  TeamColor,
  TeamMode
} from '@/lib/gameState';
import { useControlAccess } from '@/contexts/ControlAccessContext';
import { downloadShowWorkbook } from '@/lib/workbook';
import { useBackupMode } from '@/lib/useBackupMode';
import Papa from 'papaparse';
import {
  collection,
  query,
  onSnapshot,
  doc,
  writeBatch,
  setDoc,
  deleteField
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ControlPage() {
  // Authentication
  const { isAuthenticated, authenticate, logout } = useControlAccess();
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Failover: this app only drives the show when backupMode is ON.
  const { backupMode, setBackupMode } = useBackupMode();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualQuestion, setManualQuestion] = useState({
    text: '',
    answers: [{ text: '', value: 0 }]
  });
  const [audienceMembers, setAudienceMembers] = useState<AudienceMember[]>([]);
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>([]);
  const [round1SelectedAnswer, setRound1SelectedAnswer] = useState<string>(''); // For marking correct guess
  const [round1TeamAmounts, setRound1TeamAmounts] = useState<{ red: number; green: number; blue: number }>({
    red: 0,
    green: 0,
    blue: 0
  });
  const [round2Selection, setRound2Selection] = useState<string[]>([]);

  const [round2ManualScores, setRound2ManualScores] = useState<{ [key: string]: number }>({});
  const [round2TimerDuration, setRound2TimerDuration] = useState<string>('90');
  const [round3PenaltyAmount, setRound3PenaltyAmount] = useState<string>('0');
  const [round3BucketTotal, setRound3BucketTotal] = useState<string>('6000');
  // True while the operator is typing in the bucket field. The field is a draft
  // of a value that lives in game state, so it has to accept live updates from
  // elsewhere WITHOUT yanking the number out from under someone mid-edit.
  const bucketFocused = useRef(false);
  const [episodeInfo, setEpisodeInfo] = useState('');
  const [manualScoreInputs, setManualScoreInputs] = useState<{ [key: string]: string }>({ red: '', green: '', blue: '' });

  // Draft for the "add an answer" row inside the Question Bank editor.
  const [newAnswerDraft, setNewAnswerDraft] = useState({ text: '', value: '' });

  // Question Bank editor — edit ANY question mid-show, not just the active one
  const [bankEditingId, setBankEditingId] = useState<string | null>(null);
  const [bankEditDraft, setBankEditDraft] = useState<{
    text: string;
    displayText: string;
    answers: { id: string; text: string; value: string; revealed: boolean }[];
  } | null>(null);

  // Show timeline (sheet 2 of the export) + team format
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [modeDraft, setModeDraft] = useState<{ mode: TeamMode; a: TeamColor; b: TeamColor }>({
    mode: '3-horse',
    a: 'red',
    b: 'blue'
  });

  // Brand Section State
  const [brandQuestions, setBrandQuestions] = useState<BrandQuestion[]>([]);
  const [brandCsvFile, setBrandCsvFile] = useState<File | null>(null);

  // Upload Tab State
  const [activeUploadTab, setActiveUploadTab] = useState<'game' | 'brand'>('game');
  // Question Bank Tab State
  const [activeBankTab, setActiveBankTab] = useState<'game' | 'brand'>('game');

  // Audio refs
  const bigXAudioRef = useRef<HTMLAudioElement | null>(null);
  const teamAnswerAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostAnswerAudioRef = useRef<HTMLAudioElement | null>(null);

  // Audio state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(0.7);

  // Initialize audio elements
  useEffect(() => {
    bigXAudioRef.current = new Audio('/sounds/big-x.mp3');
    teamAnswerAudioRef.current = new Audio('/sounds/team-answer-reveal.mp3');
    hostAnswerAudioRef.current = new Audio('/sounds/host-answer-reveal.mp3');

    // Preload audio files
    const preloadAudio = async () => {
      try {
        if (bigXAudioRef.current) await bigXAudioRef.current.load();
        if (teamAnswerAudioRef.current) await teamAnswerAudioRef.current.load();
        if (hostAnswerAudioRef.current) await hostAnswerAudioRef.current.load();
      } catch {
        console.log('Audio files not found yet - will play when provided');
      }
    };
    preloadAudio();
  }, []);

  // Update volume when it changes
  useEffect(() => {
    if (bigXAudioRef.current) bigXAudioRef.current.volume = audioVolume;
    if (teamAnswerAudioRef.current) teamAnswerAudioRef.current.volume = audioVolume;
    if (hostAnswerAudioRef.current) hostAnswerAudioRef.current.volume = audioVolume;
  }, [audioVolume]);

  // Audio playing functions
  const playBigXSound = async () => {
    if (!audioEnabled || !bigXAudioRef.current) return;
    try {
      bigXAudioRef.current.currentTime = 0;
      await bigXAudioRef.current.play();
    } catch (error) {
      console.log('Could not play Big X sound:', error);
    }
  };

  const playTeamAnswerSound = async () => {
    if (!audioEnabled || !teamAnswerAudioRef.current) return;
    try {
      teamAnswerAudioRef.current.currentTime = 0;
      await teamAnswerAudioRef.current.play();
    } catch (error) {
      console.log('Could not play team answer sound:', error);
    }
  };

  const playHostAnswerSound = async () => {
    if (!audioEnabled || !hostAnswerAudioRef.current) return;
    try {
      hostAnswerAudioRef.current.currentTime = 0;
      await hostAnswerAudioRef.current.play();
    } catch (error) {
      console.log('Could not play host answer sound:', error);
    }
  };

  useEffect(() => {
    console.log('Control page: Initializing...');

    // Initialize game
    gameStateManager.initializeGame().then(() => {
      console.log('Control page: Game initialized');
    }).catch((error) => {
      console.error('Control page: Error initializing game:', error);
    });

    // Subscribe to real-time updates
    const unsubscribeGameState = gameStateManager.subscribeToGameState((state) => {
      console.log('Control page: Game state updated:', state);
      setGameState(state);
    });

    const unsubscribeTeams = gameStateManager.subscribeToTeams((teamsData) => {
      console.log('Control page: Teams updated:', teamsData);
      setTeams(teamsData);
    });

    const unsubscribeQuestion = gameStateManager.subscribeToCurrentQuestion((question) => {
      console.log('Control page: Question updated:', question);
      setCurrentQuestion(question);
    });

    // Subscribe to audience members
    const unsubscribeAudience = gameStateManager.subscribeToAudienceMembers((members) => {
      console.log('Control page: Audience members updated:', members);
      setAudienceMembers(members);
    });

    // Load initial questions from Firebase
    const loadQuestionsFromFirebase = async () => {
      try {
        const q = query(collection(db, 'questions'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const questions: Question[] = [];
          const seenIds = new Set<string>();
          querySnapshot.forEach((docSnapshot) => {
            const questionData = { id: docSnapshot.id, ...docSnapshot.data() } as Question;
            // Only add if we haven't seen this ID yet (deduplicate)
            if (!seenIds.has(questionData.id)) {
              questions.push(questionData);
              seenIds.add(questionData.id);
            }
          });
          setLoadedQuestions(questions);
        });
        // Return unsubscribe function for cleanup
        return unsubscribe;
      } catch (error) {
        console.error('Error loading questions from Firebase:', error);
      }
    };

    // Load Brand questions from Firebase
    const loadBrandQuestionsFromFirebase = async () => {
      try {
        const q = query(collection(db, 'brand_questions'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const questions: BrandQuestion[] = [];
          querySnapshot.forEach((docSnapshot) => {
            questions.push({ id: docSnapshot.id, ...docSnapshot.data() } as BrandQuestion);
          });
          setBrandQuestions(questions);
        });
        return unsubscribe;
      } catch (error) {
        console.error('Error loading brand questions:', error);
      }
    };

    const unsubscribeQuestionsPromise = loadQuestionsFromFirebase();
    const unsubscribeBrandQuestionsPromise = loadBrandQuestionsFromFirebase();
    const unsubscribeTimeline = gameStateManager.subscribeToTimeline(setTimeline);

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
      unsubscribeAudience();
      unsubscribeTimeline();
      unsubscribeQuestionsPromise.then(unsubscribe => unsubscribe && unsubscribe());
      unsubscribeBrandQuestionsPromise.then(unsubscribe => unsubscribe && unsubscribe());
    };
  }, []);

  // Keep the prize bucket field in step with the game. Without this the field
  // kept whatever was last typed, so the panel and the display could disagree
  // and a penalty would be applied to the stored value rather than the shown one.
  useEffect(() => {
    if (bucketFocused.current) return;
    const stored = gameState?.round3BucketTotal;
    if (stored === undefined || stored === null) return;
    setRound3BucketTotal(String(stored));
  }, [gameState?.round3BucketTotal]);

  // Keep the format picker in step with the stored format.
  useEffect(() => {
    if (!gameState?.activeTeams) return;
    setModeDraft({
      mode: gameState.teamMode ?? '3-horse',
      a: gameState.activeTeams[0] ?? 'red',
      b: gameState.activeTeams[1] ?? 'blue'
    });
  }, [gameState?.teamMode, gameState?.activeTeams]);

  const handleSetTeamMode = async () => {
    const { mode, a, b } = modeDraft;
    if (mode === '2v2' && a === b) {
      alert('Pick two different horses for a 2v2.');
      return;
    }
    setLoading(true);
    try {
      await gameStateManager.setTeamMode(mode, mode === '2v2' ? [a, b] : ['red', 'green', 'blue']);
    } catch (error) {
      console.error('Error setting team mode:', error);
      alert('Could not change the format. Check the console.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Keep the open bank editor in step with Firestore after an answer is added
   * or deleted. In-progress text edits are preserved by matching on answer id;
   * only the rows themselves are re-synced.
   */
  useEffect(() => {
    if (!bankEditingId) return;
    const question = loadedQuestions.find(q => q.id === bankEditingId);
    if (!question) { closeBankEditor(); return; }
    setBankEditDraft(prev => {
      if (!prev) return prev;
      if (prev.answers.length === question.answers.length) return prev;
      return {
        ...prev,
        answers: question.answers.map(a => {
          const existing = prev.answers.find(d => d.id === a.id);
          return existing
            ? { ...existing, revealed: a.revealed }
            : { id: a.id, text: a.text, value: String(a.value), revealed: a.revealed };
        })
      };
    });
  }, [bankEditingId, loadedQuestions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========== LIVE QUESTION EDITING ==========

  /** Add an answer to any question in the bank, mid-show. */
  const handleAddAnswer = async (questionId: string) => {
    if (!newAnswerDraft.text.trim()) return;
    setLoading(true);
    try {
      await gameStateManager.addAnswer(
        questionId,
        newAnswerDraft.text.trim(),
        parseInt(newAnswerDraft.value, 10) || 0
      );
      setNewAnswerDraft({ text: '', value: '' });
    } catch (error) {
      console.error('Error adding answer:', error);
      alert('Failed to add the answer. Check the console.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnswer = async (questionId: string, answerId: string, answerText: string) => {
    if (!confirm(`Delete the answer "${answerText}"? If it was revealed and scored, the points are returned.`)) return;
    setLoading(true);
    try {
      await gameStateManager.deleteAnswer(questionId, answerId);
    } catch (error) {
      console.error('Error deleting answer:', error);
      alert('Failed to delete the answer. Check the console.');
    } finally {
      setLoading(false);
    }
  };

  const openBankEditor = (question: Question) => {
    setBankEditingId(question.id);
    setBankEditDraft({
      text: question.text,
      displayText: question.displayText ?? '',
      answers: question.answers.map(a => ({
        id: a.id,
        text: a.text,
        value: String(a.value),
        revealed: a.revealed
      }))
    });
  };

  const closeBankEditor = () => {
    setBankEditingId(null);
    setBankEditDraft(null);
  };

  /** Save every changed field of the question being edited, in one go. */
  const saveBankEditor = async () => {
    if (!bankEditingId || !bankEditDraft) return;
    const original = loadedQuestions.find(q => q.id === bankEditingId);
    if (!original) return;

    setLoading(true);
    try {
      if (
        bankEditDraft.text.trim() !== original.text ||
        bankEditDraft.displayText.trim() !== (original.displayText ?? '')
      ) {
        await gameStateManager.updateQuestionText(
          bankEditingId,
          bankEditDraft.text.trim(),
          bankEditDraft.displayText.trim()
        );
      }
      for (const draft of bankEditDraft.answers) {
        const before = original.answers.find(a => a.id === draft.id);
        if (!before) continue;
        const value = parseInt(draft.value, 10);
        if (isNaN(value)) throw new Error(`"${draft.text}" has a non-numeric value`);
        if (draft.text.trim() === before.text && value === before.value) continue;
        await gameStateManager.updateAnswer(bankEditingId, draft.id, {
          text: draft.text.trim(),
          value
        });
      }
      closeBankEditor();
    } catch (error) {
      console.error('Error saving question edits:', error);
      alert(`Could not save: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (!confirm(`Delete question ${question.id}? This removes it from the bank for the rest of the show.`)) return;
    setLoading(true);
    try {
      await gameStateManager.deleteQuestion(question.id);
      if (bankEditingId === question.id) closeBankEditor();
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Failed to delete the question. Check the console.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGameState = async (updates: Partial<GameState>) => {
    setLoading(true);
    try {
      await gameStateManager.updateGameState(updates);

      // Play Big X sound when toggling
      if (updates.bigX !== undefined && updates.bigX) {
        await playBigXSound();
      }
    } catch (error) {
      console.error('Error updating game state:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Opening/closing voting is its own call: closing also bumps the voting round
   * and recounts the dugouts, and records the tally on the timeline.
   */
  const handleSetAudienceWindow = async (open: boolean) => {
    setLoading(true);
    try {
      await gameStateManager.setAudienceWindow(open);
      if (!open) setAudienceMembers(await gameStateManager.getAudienceMembers());
    } catch (error) {
      console.error('Error changing the voting window:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = async (teamId: TeamColor, change: number) => {
    setLoading(true);
    try {
      await gameStateManager.adjustScore(teamId, change);
    } catch (error) {
      console.error('Error updating score:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download the show workbook: sheet 1 the voter list, sheet 2 the timeline of
   * the episode in the order it happened.
   */
  const handleExportWorkbook = async (): Promise<boolean> => {
    try {
      const [members, events] = await Promise.all([
        gameStateManager.getAudienceMembers(),
        gameStateManager.getTimeline()
      ]);
      if (members.length === 0 && events.length === 0) {
        alert('Nothing to export yet — no votes and no game events.');
        return false;
      }
      const fileName = await downloadShowWorkbook({
        members,
        timeline: events,
        activeTeams: gameState?.activeTeams ?? ['red', 'green', 'blue'],
        episodeInfo: gameState?.episodeInfo
      });
      console.log(`Exported ${members.length} voters and ${events.length} events to ${fileName}`);
      return true;
    } catch (error) {
      console.error('Error exporting workbook:', error);
      alert('Failed to build the Excel file. Check the console.');
      return false;
    }
  };

  const handleResetGame = async () => {
    if (!confirm('Are you sure you want to reset the entire game?')) return;

    const members = await gameStateManager.getAudienceMembers().catch(() => []);

    const finalConfirm = confirm(
      `FINAL CONFIRMATION: This will permanently delete ${members.length} audience votes, ${timeline.length} timeline events, reset scores and clear game state. The workbook downloads first as a backup. Continue?`
    );
    if (!finalConfirm) return;

    // Last-chance backup, downloaded before anything is destroyed.
    if (members.length > 0 || timeline.length > 0) await handleExportWorkbook();

    setLoading(true);
    try {
      console.log('Control: Starting game reset...');
      await gameStateManager.resetGame();
      setCurrentQuestion(null);
      console.log('Control: Game reset completed.');
      alert('Game reset complete.');
    } catch (error) {
      console.error('Error resetting game:', error);
      alert('Error during game reset. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (questionId: string) => {
    // Resets the board, puts the question up (revealed in round1/round3/pre-show)
    // and records it on the timeline.
    gameStateManager.selectQuestion(questionId).catch((error) => {
      console.error('Error selecting question:', error);
    });
  };

  const handleBrandCsvUpload = async () => {
    if (!brandCsvFile) return;

    if (!confirm('Are you sure you want to upload this BRAND CSV? This will DELETE all existing BRAND questions.')) {
      return;
    }

    setLoading(true);
    try {
      await gameStateManager.clearAllBrandQuestions();
      console.log('Control: All existing brand questions have been cleared.');

      Papa.parse(brandCsvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results: Papa.ParseResult<Record<string, string>>) => {
          const batch = writeBatch(db);
          let count = 0;
          for (const row of results.data) {
            const questionId = row.QuestionID;
            const questionText = row.QuestionText;

            if (!questionId || !questionText) {
              console.warn('Skipping invalid row:', row);
              continue;
            }

            const question: BrandQuestion = {
              id: questionId.trim(),
              text: questionText.trim()
            };

            const questionDocRef = doc(db, 'brand_questions', questionId.trim());
            batch.set(questionDocRef, question);
            count++;
          }

          await batch.commit();

          alert(`Successfully loaded ${count} BRAND questions!`);
          setBrandCsvFile(null);
          setLoading(false);
        },
        error: (error) => {
          console.error('Error parsing Brand CSV:', error);
          alert('Error parsing Brand CSV.');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Error uploading Brand CSV:', error);
      alert('Error uploading Brand CSV.');
      setLoading(false);
    }
  };

  const handleSelectBrandQuestion = async (questionId: string) => {
    setLoading(true);
    try {
      await gameStateManager.updateGameState({
        activeBrandQuestionId: questionId,
        currentRound: 'brand' // Ensure we are in brand mode
      });
      console.log('Control: Selected Brand question:', questionId);
    } catch (error) {
      console.error('Error selecting brand question:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;

    // Add a confirmation dialog
    if (!confirm('Are you sure you want to upload this CSV? This will DELETE all existing questions and replace them with the new set.')) {
      return;
    }

    setLoading(true);
    try {
      // First, clear all existing questions from Firebase
      await gameStateManager.clearAllQuestions();
      console.log('Control: All existing questions have been cleared.');

      Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results: Papa.ParseResult<Record<string, string>>) => {
          const batch = writeBatch(db);
          let count = 0;
          for (const row of results.data) {
            const questionId = row.QuestionID;
            const questionText = row.QuestionText;
            const displayText = row.DisplayText; // Optional teaser text for Round 2
            const answerCount = parseInt(row.AnswerCount) || 10;

            if (!questionId || !questionText) {
              console.warn('Skipping invalid row:', row);
              continue;
            }

            const answers = [];
            for (let i = 1; i <= answerCount; i++) {
              const answerText = row[`Answer${i}`];
              const answerValue = parseInt(row[`Value${i}`]) || 0;

              if (answerText) {
                answers.push({
                  id: `${questionId}_answer_${i}`,
                  text: answerText.trim(),
                  value: answerValue,
                  revealed: false,
                  attribution: null
                });
              }
            }

            const question: Question = {
              id: questionId.trim(),
              text: questionText.trim(),
              ...(displayText && displayText.trim() ? { displayText: displayText.trim() } : {}),
              answers,
              answerCount: answers.length // Use the actual number of parsed answers
            };

            // Use the question ID as the document ID (not auto-generated)
            const questionDocRef = doc(db, 'questions', questionId.trim());
            batch.set(questionDocRef, question);
            count++;
          }

          await batch.commit();

          alert(`Successfully loaded ${count} questions!`);
          setCsvFile(null);
          setLoading(false);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          alert('Error parsing CSV. Please check the file format and console for details.');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Error uploading CSV:', error);
      alert('An unexpected error occurred during CSV upload.');
      setLoading(false);
    }
  };

  const handleAddManualQuestion = async () => {
    if (!manualQuestion.text) {
      alert('Please enter a question text');
      return;
    }

    setLoading(true);
    try {
      const questionId = `manual_${Date.now()}`;
      const answers = manualQuestion.answers
        .filter(answer => answer.text && answer.value > 0)
        .map((answer, index) => ({
          id: `${questionId}_answer_${index + 1}`,
          text: answer.text,
          value: answer.value,
          revealed: false,
          attribution: null
        }));

      const newQuestion: Question = {
        id: questionId,
        text: manualQuestion.text,
        answers,
        answerCount: answers.length
      };

      // Use the generated questionId as the document ID
      const questionDocRef = doc(db, 'questions', questionId);
      await setDoc(questionDocRef, newQuestion);
      alert('Question added successfully!');

      // Reset form
      setManualQuestion({
        text: '',
        answers: [{ text: '', value: 0 }]
      });
    } catch (error: unknown) {
      console.error("Error adding question:", error);
      alert(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const addAnswerField = () => {
    setManualQuestion({
      ...manualQuestion,
      answers: [...manualQuestion.answers, { text: '', value: 0 }]
    });
  };

  const removeAnswerField = (index: number) => {
    if (manualQuestion.answers.length > 1) {
      const newAnswers = manualQuestion.answers.filter((_, i) => i !== index);
      setManualQuestion({
        ...manualQuestion,
        answers: newAnswers
      });
    }
  };

  const updateAnswerField = (index: number, field: 'text' | 'value', value: string | number) => {
    const newAnswers = [...manualQuestion.answers];
    newAnswers[index] = { ...newAnswers[index], [field]: value };
    setManualQuestion({
      ...manualQuestion,
      answers: newAnswers
    });
  };

  const handleRevealAllAnswers = async () => {
    if (!currentQuestion) return;

    setLoading(true);
    try {
      await gameStateManager.revealAllAnswers(currentQuestion.id);
      console.log('Control: All answers revealed successfully');
    } catch (error) {
      console.error('Error revealing all answers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHideAllAnswers = async () => {
    if (!currentQuestion) return;

    setLoading(true);
    try {
      await gameStateManager.hideAllAnswers(currentQuestion.id);
      console.log('Control: All answers hidden successfully');
    } catch (error) {
      console.error('Error hiding all answers:', error);
    } finally {
      setLoading(false);
    }
  };

  // ========== ROUND 1 HANDLERS ==========

  const handleStartRound1 = async () => {
    setLoading(true);
    try {
      await gameStateManager.startRound1();
      console.log('Control: Round 1 started');
    } catch (error) {
      console.error('Error starting Round 1:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRound1GuessingTeam = async (team: 'red' | 'green' | 'blue') => {
    setLoading(true);
    try {
      await gameStateManager.selectRound1GuessingTeam(team);
      console.log('Control: Selected guessing team:', team);
    } catch (error) {
      console.error('Error selecting guessing team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateRound1Guess = async (isCorrect: boolean) => {
    if (!currentQuestion) {
      alert('Please select a question first');
      return;
    }

    setLoading(true);
    try {
      if (isCorrect) {
        // If correct, need to select which answer matches
        if (!round1SelectedAnswer) {
          alert('Please select which answer matches the guess');
          setLoading(false);
          return;
        }
        if (!gameState?.round1CurrentGuessingTeam) {
          alert('Please select the team that is guessing');
          setLoading(false);
          return;
        }
        const unrevealedCount = currentQuestion.answers
          .slice(0, currentQuestion.answerCount)
          .filter(a => !a.revealed).length;
        const isRound3LastAnswer = gameState?.currentRound === 'round3' && unrevealedCount === 1;
        const manualAmount = isRound3LastAnswer
          ? (parseInt(round3BucketTotal) || 0)
          : (round1TeamAmounts[gameState.round1CurrentGuessingTeam] || 0);
        await gameStateManager.evaluateRound1Guess(
          true,
          round1SelectedAnswer,
          manualAmount > 0 ? manualAmount : undefined
        );
        await playTeamAnswerSound();
        setRound1SelectedAnswer('');
      } else {
        // Wrong answer in round3: deduct penalty from team and add to bucket
        if (gameState?.currentRound === 'round3' && gameState?.round1CurrentGuessingTeam) {
          const penalty = parseInt(round3PenaltyAmount) || 0;
          if (penalty > 0) {
            // Deducts, tops up the bucket and records one timeline row.
            const newBucket = await gameStateManager.applyRound3Penalty(
              gameState.round1CurrentGuessingTeam,
              penalty
            );
            setRound3BucketTotal(String(newBucket));
          }
        }

        await gameStateManager.evaluateRound1Guess(false);

        await gameStateManager.updateGameState({ bigX: true });
        setTimeout(async () => {
          try {
            await gameStateManager.updateGameState({ bigX: false });
          } catch (error) {
            console.error('Error clearing big X:', error);
          }
        }, 1000);
      }
      console.log('Control: Guess evaluated');
    } catch (error) {
      console.error('Error evaluating guess:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEndRound1 = async () => {
    setLoading(true);
    try {
      await gameStateManager.endRound1();
      console.log('Control: Round 1 ended');
    } catch (error) {
      console.error('Error ending Round 1:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRound1TeamAmountChange = (team: 'red' | 'green' | 'blue', amount: number) => {
    setRound1TeamAmounts(prev => ({
      ...prev,
      [team]: amount
    }));
  };

  const handleRound1OpenReveal = async () => {
    if (!currentQuestion) {
      alert('Please select a question first');
      return;
    }
    if (!round1SelectedAnswer) {
      alert('Please select which answer to reveal');
      return;
    }

    setLoading(true);
    try {
      await gameStateManager.revealAnswer(
        currentQuestion.id,
        round1SelectedAnswer,
        'neutral'
      );

      await playHostAnswerSound();

      setRound1SelectedAnswer('');
    } catch (error) {
      console.error('Error revealing answer via host/neutral:', error);
    } finally {
      setLoading(false);
    }
  };

  // ========== ROUND 2 HANDLERS ==========
  const handleRound2StartTimer = async () => {
    setLoading(true);
    try {
      await gameStateManager.startRound2Timer(parseInt(round2TimerDuration) || 90);
      console.log('Control: Round 2 timer started');
    } catch (error) {
      console.error('Error starting Round 2 timer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRound2StopTimer = async () => {
    setLoading(true);
    try {
      await gameStateManager.endRound2Timer();
      console.log('Control: Round 2 timer stopped');
    } catch (error) {
      console.error('Error stopping Round 2 timer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRound2RevealAnswer = async (answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral') => {
    if (!currentQuestion) return;

    setLoading(true);
    try {
      const manualScore = round2ManualScores[answerId];
      await gameStateManager.revealAnswer(
        currentQuestion.id,
        answerId,
        attribution,
        manualScore > 0 ? manualScore : undefined
      );
      await playHostAnswerSound();
      // Clear manual score for this answer after revealing
      setRound2ManualScores(prev => {
        const newScores = { ...prev };
        delete newScores[answerId];
        return newScores;
      });
      console.log('Control: Round 2 answer revealed:', answerId);
    } catch (error) {
      console.error('Error revealing Round 2 answer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRound2Team = async (team: 'red' | 'green' | 'blue') => {
    setLoading(true);
    try {
      await gameStateManager.selectRound2Team(team);
      setRound2Selection([]); // Clear previous selections for new team
      console.log('Control: Selected Round 2 team:', team);
    } catch (error) {
      console.error('Error selecting Round 2 team:', error);
    } finally {
      setLoading(false);
    }
  };

  // Password authentication handler
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const success = await authenticate(password);
    if (!success) {
      setAuthError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🎮</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Control Panel Access</h1>
            <p className="text-gray-600">Enter password to continue</p>
          </div>

          {/* Password Form */}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-black"
                placeholder="Enter control panel password"
                autoFocus
                required
              />
            </div>

            {authError && (
              <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
            >
              Access Control Panel
            </button>
          </form>

          {/* Footer */}
          <div className="text-center mt-6 text-sm text-gray-500">
            <p>Authorized personnel only</p>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-100 p-6 text-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between space-x-6">
          {/* CSV Upload */}
          <div className="bg-white rounded-lg shadow-md mb-6 flex-none overflow-hidden">
            <div className="flex border-b">
              <button
                className={`flex-1 py-3 font-bold text-center transition-colors ${activeUploadTab === 'game' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setActiveUploadTab('game')}
              >
                Game Questions
              </button>
              <button
                className={`flex-1 py-3 font-bold text-center transition-colors ${activeUploadTab === 'brand' ? 'bg-purple-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setActiveUploadTab('brand')}
              >
                Brand Questions
              </button>
            </div>

            <div className="p-6">
              {activeUploadTab === 'game' ? (
                <div className="space-y-6">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="block p-2 border rounded w-full"
                  />
                  <button
                    onClick={handleCsvUpload}
                    className="p-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 w-full"
                    disabled={loading || !csvFile}
                  >
                    UPLOAD GAME CSV
                  </button>
                  <button
                    onClick={() => window.open('/sample-questions.csv', '_blank')}
                    className="p-3 bg-green-100 text-green-800 border border-green-200 rounded-lg text-sm hover:bg-green-200 w-full flex items-center justify-center gap-2 font-semibold"
                  >
                    <span>📥</span> Download Sample Game CSV
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold mb-2">Upload Brand Questions</h2>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBrandCsvFile(e.target.files?.[0] || null)}
                    className="block p-2 border rounded w-full"
                  />
                  <button
                    onClick={handleBrandCsvUpload}
                    className="p-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 w-full"
                    disabled={loading || !brandCsvFile}
                  >
                    UPLOAD BRAND CSV
                  </button>
                  <button
                    onClick={() => window.open('/sample-brand-questions.csv', '_blank')}
                    className="p-3 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-sm hover:bg-indigo-200 w-full flex items-center justify-center gap-2 font-semibold"
                  >
                    <span>📥</span> Download Sample Brand CSV
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Header */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 grow">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-xl font-bold text-gray-900">Game Show Control Panel (BACKUP)</h1>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors text-sm"
              >
                🚪 Logout
              </button>
            </div>

            {/* Failover banner + switch */}
            <div
              className={`mb-4 rounded-lg border p-3 flex items-center justify-between gap-4 ${backupMode
                ? 'bg-green-50 border-green-400'
                : 'bg-amber-50 border-amber-400'
                }`}
            >
              <div className="text-sm">
                <div className={`font-bold ${backupMode ? 'text-green-800' : 'text-amber-900'}`}>
                  {backupMode ? '✓ YOU ARE IN CONTROL' : '⚠ THE SERVER IS IN CONTROL'}
                </div>
                <div className="text-xs text-gray-600">
                  {backupMode
                    ? 'The live server has stopped mirroring. This panel is driving the show.'
                    : 'Anything you change here will be overwritten by the server. Take control first.'}
                </div>
              </div>
              <button
                onClick={async () => {
                  const next = !backupMode;
                  const msg = next
                    ? 'TAKE CONTROL of the show? The live server stops mirroring and this panel becomes the authority. Do not switch back mid-show.'
                    : 'Hand control back to the SERVER? Only do this if the server is healthy and nobody is running the show from here.';
                  if (!confirm(msg)) return;
                  try {
                    await setBackupMode(next);
                  } catch (error) {
                    console.error('Failover switch failed:', error);
                    alert('Could not flip the failover switch — check Firestore rules for control/mode.');
                  }
                }}
                className={`shrink-0 px-4 py-2 rounded-lg font-bold text-sm text-white ${backupMode ? 'bg-gray-700 hover:bg-gray-800' : 'bg-green-600 hover:bg-green-700'
                  }`}
              >
                {backupMode ? 'GIVE CONTROL BACK' : 'TAKE CONTROL'}
              </button>
            </div>

            {/* Team format: 3 horses or 2v2 */}
            <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-indigo-900 mb-1">Show format</label>
                  <select
                    value={modeDraft.mode}
                    onChange={(e) => setModeDraft({ ...modeDraft, mode: e.target.value as TeamMode })}
                    className="p-2 border border-indigo-300 rounded text-sm bg-white"
                    disabled={loading}
                  >
                    <option value="3-horse">3 Horses (Red · Green · Blue)</option>
                    <option value="2v2">2v2 (pick two horses)</option>
                  </select>
                </div>

                {modeDraft.mode === '2v2' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-indigo-900 mb-1">Team A</label>
                      <select
                        value={modeDraft.a}
                        onChange={(e) => setModeDraft({ ...modeDraft, a: e.target.value as TeamColor })}
                        className="p-2 border border-indigo-300 rounded text-sm bg-white capitalize"
                        disabled={loading}
                      >
                        {(['red', 'green', 'blue'] as TeamColor[]).map(c => (
                          <option key={c} value={c} className="capitalize">{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-indigo-900 mb-1">Team B</label>
                      <select
                        value={modeDraft.b}
                        onChange={(e) => setModeDraft({ ...modeDraft, b: e.target.value as TeamColor })}
                        className="p-2 border border-indigo-300 rounded text-sm bg-white capitalize"
                        disabled={loading}
                      >
                        {(['red', 'green', 'blue'] as TeamColor[]).map(c => (
                          <option key={c} value={c} className="capitalize">{c}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <button
                  onClick={handleSetTeamMode}
                  className="p-2 px-4 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
                  disabled={loading}
                >
                  APPLY FORMAT
                </button>

                <div className="text-xs text-indigo-800 ml-auto">
                  In play now:{' '}
                  <strong className="uppercase">
                    {(gameState?.activeTeams ?? []).join(' · ') || '—'}
                  </strong>
                  {gameState?.teamMode === '2v2' && (
                    <span className="ml-2 px-2 py-0.5 bg-indigo-600 text-white rounded-full font-bold">2v2</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-indigo-700 mt-2">
                The horses not in play disappear from the control panel, the display and the audience
                voting screen. Their scores are kept, so switching back mid-show loses nothing.
              </p>
            </div>

            {/* Game State Overview */}
            <div className={`grid grid-cols-2 gap-4 mb-6 ${teams.length === 2 ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
              <div className="text-left">
                <div className="text-sm text-gray-600 mb-2">Current Round</div>
                <div className="text-xl font-bold mb-2">{gameState?.currentRound?.toUpperCase() || 'PRE-SHOW'}</div>
                <select
                  value={gameState?.currentRound || 'pre-show'}
                  onChange={(e) => {
                    const newRound = e.target.value;
                    if (newRound === 'pre-show') {
                      gameStateManager.startPreShow();
                    } else if (newRound === 'round1') {
                      handleStartRound1();
                    } else if (newRound === 'round2') {
                      gameStateManager.startRound2();
                    } else if (newRound === 'round3') {
                      gameStateManager.startRound3();
                    } else {
                      handleUpdateGameState({ currentRound: newRound as GameState['currentRound'] });
                    }
                  }}
                  className="text-md p-2 border rounded w-full"
                  disabled={loading}
                >
                  <option value="pre-show">Pre-Show</option>
                  <option value="round1">Round 1</option>
                  <option value="round2">Round 2</option>
                  <option value="round3">Round 3</option>
                  <option value="brand">Brand Section</option>
                  <option value="final">Final</option>
                </select>
              </div>

              {/* Team Scores and Audience Voting */}

              {teams.map((team) => (
                <div key={team.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold" style={{ color: team.color }}>{team.name}</h3>
                    <span className="text-sm text-gray-600">
                      Dugout: {audienceMembers.filter(m => m.team === team.id).length}
                    </span>
                  </div>
                  <div className="text-xl font-bold mb-2">₹{team.score.toLocaleString()}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleScoreChange(team.id, 100)}
                      className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                      disabled={loading}
                    >
                      +100
                    </button>
                    <button
                      onClick={() => handleScoreChange(team.id, -100)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                      disabled={loading}
                    >
                      -100
                    </button>
                    <button
                      onClick={() => handleScoreChange(team.id, 500)}
                      className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                      disabled={loading}
                    >
                      +500
                    </button>
                    <button
                      onClick={() => handleScoreChange(team.id, -500)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                      disabled={loading}
                    >
                      -500
                    </button>
                  </div>
                  <div className="mt-2 flex space-x-2">
                    <input
                      type="number"
                      placeholder="Add amount"
                      className="w-full p-1 border rounded text-sm"
                      value={manualScoreInputs[team.id] || ''}
                      onChange={(e) => setManualScoreInputs({
                        ...manualScoreInputs,
                        [team.id]: e.target.value
                      })}
                      disabled={loading}
                    />
                    <button
                      onClick={() => {
                        const amount = parseInt(manualScoreInputs[team.id], 10);
                        if (!isNaN(amount) && amount !== 0) {
                          handleScoreChange(team.id, amount);
                          setManualScoreInputs({ ...manualScoreInputs, [team.id]: '' });
                        }
                      }}
                      className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 font-bold"
                      disabled={loading || !manualScoreInputs[team.id]}
                    >
                      ADD
                    </button>
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">



          {/* Left Column - Question Management */}
          <div className="space-y-6">

            {/* Loaded Questions */}
            <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
              {/* Bank Tabs */}
              <div className="flex border-b">
                <button
                  className={`flex-1 py-3 font-bold text-center transition-colors ${activeBankTab === 'game' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  onClick={() => setActiveBankTab('game')}
                >
                  Game Questions
                </button>
                <button
                  className={`flex-1 py-3 font-bold text-center transition-colors ${activeBankTab === 'brand' ? 'bg-purple-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  onClick={() => setActiveBankTab('brand')}
                >
                  Brand Questions
                </button>
              </div>

              <div className="p-6">
                {activeBankTab === 'game' ? (
                  <>
                    <h2 className="text-xl font-bold mb-4">Question Bank</h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {loadedQuestions.length > 0 ? (
                        loadedQuestions.map((question) => (
                          <div
                            key={question.id}
                            className={`rounded border ${gameState?.currentQuestion === question.id
                              ? 'bg-blue-100 border-blue-500'
                              : 'bg-gray-50 border-gray-300'
                              }`}
                          >
                            <div className="flex items-stretch">
                              <button
                                onClick={() => handleSelectQuestion(question.id)}
                                className="flex-1 p-2 text-left hover:bg-gray-100 rounded-l min-w-0"
                                disabled={loading}
                              >
                                <div className="font-bold text-sm">{question.id}</div>
                                <div className="text-xs text-gray-600 truncate">{question.text}</div>
                              </button>
                              <button
                                onClick={() =>
                                  bankEditingId === question.id ? closeBankEditor() : openBankEditor(question)
                                }
                                title="Edit this question while the show runs"
                                className="px-2 text-sm border-l border-gray-300 hover:bg-gray-200"
                                disabled={loading}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(question)}
                                title="Delete this question"
                                className="px-2 text-sm border-l border-gray-300 text-red-600 hover:bg-red-100 rounded-r"
                                disabled={loading}
                              >
                                🗑
                              </button>
                            </div>

                            {/* Inline editor — any question, any time */}
                            {bankEditingId === question.id && bankEditDraft && (
                              <div className="p-3 border-t border-gray-300 bg-white space-y-2">
                                <label className="block text-[11px] font-semibold text-gray-500">QUESTION</label>
                                <textarea
                                  rows={2}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                  value={bankEditDraft.text}
                                  onChange={e => setBankEditDraft({ ...bankEditDraft, text: e.target.value })}
                                />
                                <label className="block text-[11px] font-semibold text-gray-500">
                                  ROUND 2 TEASER (optional)
                                </label>
                                <input
                                  type="text"
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                  value={bankEditDraft.displayText}
                                  onChange={e => setBankEditDraft({ ...bankEditDraft, displayText: e.target.value })}
                                />
                                <label className="block text-[11px] font-semibold text-gray-500">ANSWERS</label>
                                {bankEditDraft.answers.map((a, i) => (
                                  <div key={a.id} className="flex items-center gap-1">
                                    <span className="text-[11px] text-gray-400 w-4 shrink-0">{i + 1}</span>
                                    {a.revealed && (
                                      <span className="text-[10px] font-bold text-amber-600 shrink-0">LIVE</span>
                                    )}
                                    <input
                                      type="text"
                                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm min-w-0"
                                      value={a.text}
                                      onChange={e => setBankEditDraft({
                                        ...bankEditDraft,
                                        answers: bankEditDraft.answers.map(x =>
                                          x.id === a.id ? { ...x, text: e.target.value } : x
                                        )
                                      })}
                                    />
                                    <input
                                      type="number"
                                      className="w-16 border border-gray-300 rounded px-1 py-1 text-sm shrink-0"
                                      value={a.value}
                                      onChange={e => setBankEditDraft({
                                        ...bankEditDraft,
                                        answers: bankEditDraft.answers.map(x =>
                                          x.id === a.id ? { ...x, value: e.target.value } : x
                                        )
                                      })}
                                    />
                                    <button
                                      onClick={() => handleDeleteAnswer(question.id, a.id, a.text)}
                                      disabled={loading}
                                      title="Delete this answer"
                                      className="shrink-0 px-1.5 py-1 text-sm font-bold rounded bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 disabled:opacity-40"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}

                                {/* Add an answer to this question */}
                                <div className="flex items-center gap-1 pt-1">
                                  <span className="text-[11px] text-gray-400 w-4 shrink-0">+</span>
                                  <input
                                    type="text"
                                    placeholder="New answer"
                                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm min-w-0"
                                    value={newAnswerDraft.text}
                                    onChange={e => setNewAnswerDraft({ ...newAnswerDraft, text: e.target.value })}
                                  />
                                  <input
                                    type="number"
                                    placeholder="₹"
                                    className="w-16 border border-gray-300 rounded px-1 py-1 text-sm shrink-0"
                                    value={newAnswerDraft.value}
                                    onChange={e => setNewAnswerDraft({ ...newAnswerDraft, value: e.target.value })}
                                  />
                                  <button
                                    onClick={() => handleAddAnswer(question.id)}
                                    disabled={loading || !newAnswerDraft.text.trim()}
                                    className="shrink-0 px-2 py-1 text-sm font-bold rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                                  >
                                    Add
                                  </button>
                                </div>

                                <p className="text-[11px] text-gray-400">
                                  Edits go live the moment you save. Re-valuing an answer that is
                                  already revealed and scored moves that team&apos;s total by the
                                  difference; deleting one returns its points.
                                </p>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={saveBankEditor}
                                    disabled={loading}
                                    className="flex-1 py-1.5 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-40"
                                  >
                                    SAVE CHANGES
                                  </button>
                                  <button
                                    onClick={closeBankEditor}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm font-bold hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          No questions loaded yet. Upload CSV or add manually.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold mb-4">Brand Questions</h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {brandQuestions.length > 0 ? (
                        brandQuestions.map((q) => (
                          <button
                            key={q.id}
                            onClick={() => handleSelectBrandQuestion(q.id)}
                            className={`w-full p-2 text-left rounded border ${gameState?.activeBrandQuestionId === q.id
                              ? 'bg-purple-100 border-purple-500'
                              : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                              }`}
                            disabled={loading}
                          >
                            <div className="font-bold text-sm">{q.id}</div>
                            <div className="text-xs text-gray-600 truncate">{q.text}</div>
                            {gameState?.activeBrandQuestionId === q.id && (
                              <div className="text-xs text-purple-600 font-bold mt-1">● ACTIVE</div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          No brand questions loaded. Upload CSV.
                        </div>
                      )}
                    </div>
                    {gameState?.activeBrandQuestionId && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={async () => {
                            await gameStateManager.updateGameState({ activeBrandQuestionId: null });
                          }}
                          className="w-full p-2 bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 text-sm font-bold"
                          disabled={loading}
                        >
                          CLEAR ACTIVE QUESTION
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Manual Question */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Add Manual Question</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Question text"
                  value={manualQuestion.text}
                  onChange={(e) => setManualQuestion({ ...manualQuestion, text: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                {manualQuestion.answers.map((answer, index) => (
                  <div key={index} className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      placeholder={`Answer ${index + 1}`}
                      value={answer.text}
                      onChange={(e) => updateAnswerField(index, 'text', e.target.value)}
                      className="flex-1 p-2 border rounded"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={answer.value}
                      onChange={(e) => updateAnswerField(index, 'value', parseInt(e.target.value) || 0)}
                      className="w-20 p-2 border rounded"
                    />
                    <button
                      onClick={() => removeAnswerField(index)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                      disabled={manualQuestion.answers.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={addAnswerField}
                  className="w-full p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  + Add Answer
                </button>
                <button
                  onClick={handleAddManualQuestion}
                  className="w-full p-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700"
                  disabled={loading}
                >
                  ADD QUESTION
                </button>
              </div>
            </div>

          </div>

          {/* Middle Column - Current Question */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-2">Current Question</h2>

              {(() => {
                const selectedQuestion = loadedQuestions.find(q => q.id === gameState?.currentQuestion);
                return selectedQuestion ? (
                  <div>
                    <h3 className="font-bold text-lg mb-2">{selectedQuestion.text}</h3>

                    {!gameState?.questionRevealed ? (
                      <div className="space-y-3">
                        <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
                          <button
                            onClick={() => handleUpdateGameState({
                              questionRevealed: true,
                              revealMode: 'one-by-one'
                            })}
                            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 font-medium"
                            disabled={loading}
                          >
                            Reveal Question
                          </button>
                          <button
                            onClick={async () => {
                              await handleUpdateGameState({
                                questionRevealed: false,
                                revealMode: 'all-at-once',
                                guessMode: true
                              });
                              await handleRevealAllAnswers();
                            }}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 font-medium"
                            disabled={loading}
                          >
                            Reveal All Answers
                          </button>
                        </div>

                        {gameState?.revealMode === 'all-at-once' && gameState?.guessMode && (
                          <div className="mt-3 pt-3 border-t border-gray-300">
                            <button
                              onClick={() => handleUpdateGameState({ questionRevealed: true })}
                              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 w-full font-medium"
                              disabled={loading}
                            >
                              Reveal Question (After Guessing)
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="text-sm text-green-600 font-semibold mb-3">
                          ✓ Question is visible on display
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <span className="font-medium text-sm">Reveal Mode:</span>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleUpdateGameState({ revealMode: 'one-by-one' })}
                              className={`px-3 py-1 rounded text-xs font-medium ${gameState?.revealMode === 'one-by-one'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              disabled={loading}
                            >
                              One by One
                            </button>
                            <button
                              onClick={() => handleUpdateGameState({ revealMode: 'all-at-once' })}
                              className={`px-3 py-1 rounded text-xs font-medium ${gameState?.revealMode === 'all-at-once'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              disabled={loading}
                            >
                              All at Once
                            </button>
                          </div>
                        </div>

                        {gameState?.revealMode === 'all-at-once' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">Guess Mode:</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={gameState?.guessMode || false}
                                  onChange={() => handleUpdateGameState({ guessMode: !gameState?.guessMode })}
                                  className="sr-only peer"
                                  disabled={loading}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                              </label>
                            </div>

                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleRevealAllAnswers()}
                                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                                disabled={loading}
                              >
                                Reveal All Answers
                              </button>
                              <button
                                onClick={() => handleHideAllAnswers()}
                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                                disabled={loading}
                              >
                                Hide All Answers
                              </button>
                            </div>

                            {gameState?.guessMode && (
                              <div className="mt-3 pt-3 border-t border-gray-300">
                                <button
                                  onClick={() => handleUpdateGameState({ questionRevealed: true })}
                                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 w-full"
                                  disabled={loading}
                                >
                                  Reveal Question
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No question selected
                  </div>
                );
              })()}
            </div>


            {(['pre-show', 'round1', 'round3'].includes(gameState?.currentRound || '')) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">
                  {gameState?.currentRound === 'pre-show' && 'Pre-Show Gameplay'}
                  {gameState?.currentRound === 'round1' && 'Round 1 Gameplay'}
                  {gameState?.currentRound === 'round3' && 'Round 3 Gameplay'}
                </h2>

                <div className="space-y-4">
                  {!gameState?.round1Active && gameState?.currentRound === 'round1' && (
                    <button
                      onClick={handleStartRound1}
                      className="w-full p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                      disabled={loading}
                    >
                      START ROUND 1
                    </button>
                  )}

                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-2">
                      Select Team & Amount
                    </div>
                    <div className={`grid gap-2 ${teams.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {teams.map((team) => {
                        const isCurrentGuessing = gameState?.round1CurrentGuessingTeam === team.id;
                        return (
                          <div key={team.id} className="p-3 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold" style={{ color: team.color }}>
                                {team.name}
                              </span>
                              {isCurrentGuessing && (
                                <span className="text-xs font-bold text-blue-600">CURRENT TURN</span>
                              )}
                            </div>
                            <div className="space-y-2 ">
                              <input
                                type="number"
                                value={round1TeamAmounts[team.id as 'red' | 'green' | 'blue'] || 0}
                                onChange={(e) =>
                                  handleRound1TeamAmountChange(
                                    team.id as 'red' | 'green' | 'blue',
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-full p-2 border rounded text-sm"
                                placeholder="Amount (₹)"
                                min={0}
                                disabled={loading}
                              />
                              <button
                                onClick={() => handleSelectRound1GuessingTeam(team.id as 'red' | 'green' | 'blue')}
                                disabled={loading || isCurrentGuessing}
                                className={`p-2 w-full rounded text-sm font-medium ${isCurrentGuessing
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                              >
                                {isCurrentGuessing ? 'Selected' : 'Select'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Gameplay controls for pre-show, round1, and round3 */}
                  <>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">
                          Select the answer block for reveals:
                        </label>
                        <select
                          value={round1SelectedAnswer}
                          onChange={(e) => setRound1SelectedAnswer(e.target.value)}
                          className="w-full p-2 border rounded text-sm"
                          disabled={loading}
                        >
                          <option value="">Select answer...</option>
                          {(() => {
                            const question = loadedQuestions.find(q => q.id === gameState?.currentQuestion);
                            return question?.answers
                              ?.slice(0, question.answerCount)
                              .filter((a) => !a.revealed)
                              .map((answer, index) => (
                                <option key={answer.id} value={answer.id}>
                                  #{index + 1}: {answer.text} (₹{answer.value})
                                </option>
                              ));
                          })()}
                        </select>
                      </div>

                      {/* Round 3 penalty / bucket controls */}
                      {gameState?.currentRound === 'round3' && (() => {
                        const question = loadedQuestions.find(q => q.id === gameState?.currentQuestion);
                        const unrevealedCount = question?.answers.slice(0, question?.answerCount).filter(a => !a.revealed).length ?? 0;
                        const isLastAnswer = unrevealedCount === 1;
                        return (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-semibold text-blue-800 whitespace-nowrap">Penalty per wrong (₹):</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={round3PenaltyAmount}
                                onChange={(e) => setRound3PenaltyAmount(e.target.value)}
                                className="w-full p-1 border border-blue-300 rounded text-center font-bold text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                <label className="text-sm font-semibold text-blue-800 whitespace-nowrap">Prize bucket (₹):</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={round3BucketTotal}
                                  onFocus={() => { bucketFocused.current = true; }}
                                  onChange={(e) => setRound3BucketTotal(e.target.value)}
                                  onBlur={async () => {
                                    bucketFocused.current = false;
                                    const val = parseInt(round3BucketTotal) || 0;
                                    if (val !== (gameState?.round3BucketTotal ?? 0)) {
                                      await gameStateManager.updateGameState({ round3BucketTotal: val });
                                    }
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                  className="w-24 p-1 border border-blue-300 rounded text-center font-bold text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <button
                                onClick={async () => {
                                  const val = parseInt(round3BucketTotal) || 0;
                                  await gameStateManager.updateGameState({ round3BucketTotal: val });
                                }}
                                disabled={loading}
                                className="text-xs text-blue-700 border border-blue-400 rounded px-2 py-1 font-semibold hover:bg-blue-100 disabled:opacity-50"
                              >
                                Update
                              </button>
                              <button
                                onClick={async () => {
                                  setRound3BucketTotal('0');
                                  await gameStateManager.updateGameState({ round3BucketTotal: 0 });
                                }}
                                className="text-xs text-red-600 hover:underline font-semibold"
                              >
                                Reset
                              </button>
                            </div>
                            {isLastAnswer && (
                              <div className="mt-1 p-2 bg-yellow-100 border border-yellow-400 rounded text-center">
                                <span className="text-xs font-semibold text-yellow-800">CORRECT will award </span>
                                <span className="text-lg font-black text-yellow-900">₹{(parseInt(round3BucketTotal) || 0).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {gameState?.round1CurrentGuessingTeam && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleEvaluateRound1Guess(true)}
                            className="p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                            disabled={loading || !round1SelectedAnswer}
                          >
                            ✓ CORRECT
                          </button>
                          <button
                            onClick={() => handleEvaluateRound1Guess(false)}
                            className="p-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                            disabled={loading}
                          >
                            ✗ WRONG
                          </button>
                        </div>
                      )}

                      <div className="pt-3 border-t border-gray-200">
                        <button
                          onClick={handleRound1OpenReveal}
                          className="w-full p-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 text-sm"
                          disabled={loading || !round1SelectedAnswer}
                        >
                          OPEN REVEAL
                        </button>
                      </div>
                    </div>

                    {gameState?.currentRound === 'round1' && (
                      <div className="pt-2">
                        <button
                          onClick={handleEndRound1}
                          className="w-full p-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                          disabled={loading}
                        >
                          END ROUND 1
                        </button>
                      </div>
                    )}
                  </>
                </div>
              </div>
            )}

            {/* ROUND 2 GAMEPLAY */}
            {gameState?.currentRound === 'round2' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">Round 2 Gameplay</h2>

                {/* Team Selection - Always visible */}
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    Select Team Playing Round 2
                  </div>
                  <div className={`grid gap-2 ${teams.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {teams.map((team) => {
                      const isCurrentTeam = gameState?.round2CurrentTeam === team.id;
                      return (
                        <button
                          key={team.id}
                          onClick={() => handleSelectRound2Team(team.id as 'red' | 'green' | 'blue')}
                          disabled={loading}
                          className={`p-3 rounded-lg border-2 font-medium text-center transition-all ${isCurrentTeam
                            ? 'bg-blue-50 shadow-md'
                            : 'bg-white hover:bg-gray-50'
                            }`}
                          style={{
                            borderColor: isCurrentTeam ? team.color : '#e5e7eb',
                            backgroundColor: isCurrentTeam ? `${team.color}15` : 'white'
                          }}
                        >
                          <div className="font-bold" style={{ color: team.color }}>
                            {team.name}
                          </div>
                          {isCurrentTeam && (
                            <div className="text-xs font-bold uppercase mt-1" style={{ color: team.color }}>
                              ● Playing
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {gameState.round2UsedQuestionIds && gameState.round2UsedQuestionIds.length > 0 && (
                    <div className="text-xs text-gray-500 mt-2">
                      Questions used: {gameState.round2UsedQuestionIds.length} |
                      Available: {loadedQuestions.length - gameState.round2UsedQuestionIds.length}
                    </div>
                  )}
                </div>

                {/* Phase 1: Operator manually selects 3 questions for the whole round */}
                {(!gameState?.round2Options || gameState.round2Options.length === 0) &&
                  (!gameState?.round2UsedQuestionIds || gameState.round2UsedQuestionIds.length === 0) && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-sm font-semibold text-gray-700">
                          Step 1: Select Questions for Round 2
                        </div>
                        <div className={`text-xs font-bold ${round2Selection.length >= 2 ? 'text-green-600' : 'text-gray-500'}`}>
                          {round2Selection.length}/2 Selected
                        </div>
                      </div>

                      <div className="border rounded-lg overflow-hidden h-96 bg-red-50">
                        <div className="overflow-y-auto bg-gray-50 divide-y divide-gray-200 h-full">
                          {loadedQuestions
                            .filter(q => !(gameState?.round2UsedQuestionIds || []).includes(q.id))
                            .map((q, i) => (
                              <label key={q.id || i} className="flex items-center p-3 hover:bg-gray-100 cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  checked={round2Selection.includes(q.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      {
                                        setRound2Selection([...round2Selection, q.id]);
                                      }
                                    } else {
                                      setRound2Selection(round2Selection.filter(id => id !== q.id));
                                    }
                                  }}
                                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <div className="ml-3 flex-1">
                                  <div className="text-xs font-mono text-gray-500">{q.id}</div>
                                  <div className="text-sm text-gray-900">{q.text}</div>
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          setLoading(true);
                          try {
                            await gameStateManager.setRound2Options(round2Selection);
                            // Clear round2State so question pool becomes visible
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await gameStateManager.updateGameState({ round2State: deleteField() as any });
                            setRound2Selection([]); // Clear selection after setting
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="w-full p-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        disabled={loading || round2Selection.length < 2}
                      >
                        SET THESE 3 QUESTIONS FOR ROUND 2
                      </button>
                    </div>
                  )}

                {/* Phase 2: Teams sequentially pick from the pool */}
                {gameState?.round2Options && gameState.round2Options.length > 0 && !gameState?.round2State && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                      <div className="text-sm font-semibold text-blue-800 mb-1">
                        Available Questions: {gameState.round2Options.length}
                      </div>
                      <div className="text-xs text-blue-600">
                        {gameState.round2CurrentTeam
                          ? `Team ${teams.find(t => t.id === gameState.round2CurrentTeam)?.name} - Choose a question`
                          : 'Select a team to begin'}
                      </div>
                    </div>

                    {/* Show available questions */}
                    <div className="space-y-2">
                      {gameState.round2Options.map((qid) => {
                        const q = loadedQuestions.find(q => q.id === qid);
                        return (
                          <button
                            key={qid}
                            onClick={async () => {
                              if (!gameState.round2CurrentTeam) {
                                alert('Please select a team first!');
                                return;
                              }
                              setLoading(true);
                              try {
                                // Hide all answers first (in case question was used before)
                                await gameStateManager.hideAllAnswers(qid);

                                // Mark this question as used
                                const used = [...(gameState?.round2UsedQuestionIds || []), qid];
                                await gameStateManager.updateGameState({ round2UsedQuestionIds: used });

                                // Remove from pool
                                const remaining = gameState.round2Options!.filter(id => id !== qid);
                                await gameStateManager.setRound2Options(remaining);

                                // Set as current question and enter gameplay phase
                                await gameStateManager.updateGameState({
                                  currentQuestion: qid,
                                  questionRevealed: true,
                                  round2State: {
                                    phase: 'question',
                                    availableQuestionIds: [],
                                    activeQuestionId: qid,
                                    timerDuration: 60
                                  }
                                });
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="w-full p-4 bg-white border-2 border-gray-200 rounded-lg text-left hover:border-indigo-400 hover:bg-indigo-50 transition-all disabled:opacity-50"
                            disabled={loading || !gameState.round2CurrentTeam}
                          >
                            <div className="text-sm font-bold text-gray-800 mb-1">{q?.text || 'Unknown Question'}</div>
                            <div className="text-xs text-gray-500 font-mono">{qid}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Phase 2 & 3: Question & Reveal */}
                {(gameState.round2State?.phase === 'question' || gameState.round2State?.phase === 'reveal') && currentQuestion && (
                  <div className="space-y-3">
                    {/* Timer Control */}
                    <div className="flex gap-2">
                      <button
                        onClick={gameState.timerActive ? handleRound2StopTimer : handleRound2StartTimer}
                        className={`w-[60%] p-2 rounded-lg font-bold text-xl shadow-sm transition-all flex items-center justify-center ${gameState.timerActive
                          ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                          : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                      >
                        {gameState.timerActive ? 'STOP TIMER' : `START ${round2TimerDuration}s TIMER`}
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={round2TimerDuration}
                        onChange={(e) => setRound2TimerDuration(e.target.value)}
                        disabled={gameState.timerActive}
                        className="w-[40%] p-2 rounded bg-white text-gray-900 border border-gray-300 text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        placeholder="90"
                      />
                    </div>

                    {/* Answers & Scoring */}
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-3">Answers & Scoring</div>
                      <div className="space-y-3 overflow-hidden">
                        {currentQuestion.answers.map((answer, index) => (
                          <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-gray-900">{answer.text}</div>
                              <div className="text-sm font-bold text-gray-500">Value: {answer.value}</div>
                            </div>

                            {!answer.revealed ? (
                              <div className="flex items-center space-x-2 mt-2">
                                <input
                                  type="number"
                                  placeholder="Score"
                                  className="w-24 p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  value={round2ManualScores[answer.id] || ''}
                                  onChange={(e) => setRound2ManualScores({
                                    ...round2ManualScores,
                                    [answer.id]: parseInt(e.target.value) || 0
                                  })}
                                />
                                <div className="flex-1 flex space-x-2">
                                  {gameState.activeTeam && (
                                    <button
                                      onClick={() => handleRound2RevealAnswer(answer.id, gameState.activeTeam!)}
                                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                                    >
                                      Reveal ({gameState.activeTeam.toUpperCase()})
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRound2RevealAnswer(answer.id, 'neutral')}
                                    className="px-3 py-2 bg-gray-600 text-white rounded text-sm font-medium hover:bg-gray-700 transition-colors"
                                  >
                                    Reveal (No Score)
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center text-green-600 bg-green-50 p-2 rounded border border-green-100">
                                <span className="font-bold mr-2">✓ REVEALED</span>
                                {answer.attribution && (
                                  <span className="text-xs bg-white border border-green-200 px-2 py-0.5 rounded text-green-700 font-medium uppercase">
                                    {answer.attribution}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Finish Round Button */}
                    <div className="pt-3 border-t border-gray-200">
                      <button
                        onClick={async () => {
                          setLoading(true);
                          try {
                            await gameStateManager.updateGameState({
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              round2State: deleteField() as any,
                              round2CurrentTeam: null,
                              currentQuestion: null,
                              questionRevealed: false,
                              // Stop timer when finishing round
                              timerActive: false,
                              timerStartTime: null
                            });
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="w-full p-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700"
                        disabled={loading}
                      >
                        FINISH THIS TEAM&apos;S ROUND
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}


          </div>

          {/* Right Column - Controls and Overlays */}
          <div className="space-y-6">
            {/* Overlay Controls */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Overlays</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Big X</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.bigX || false}
                      onChange={() => handleUpdateGameState({ bigX: !gameState?.bigX })}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Logo</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.logoOnly || false}
                      onChange={() => handleUpdateGameState({ logoOnly: !gameState?.logoOnly })}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Scorecard</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.scorecardOverlay || false}
                      onChange={() => handleUpdateGameState({ scorecardOverlay: !gameState?.scorecardOverlay })}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                {/* Vote Shift Overlay */}
                <div className="flex items-center justify-between">
                  <span className="font-medium">Vote Shift Overlay</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.voteShiftOverlay || false}
                      onChange={() => handleUpdateGameState({ voteShiftOverlay: !gameState?.voteShiftOverlay })}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Audience Voting</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.audienceWindow || false}
                      onChange={() => handleSetAudienceWindow(!gameState?.audienceWindow)}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">End Show Screen</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState?.showEndScreen || false}
                      onChange={() => handleUpdateGameState({ showEndScreen: !gameState?.showEndScreen })}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                  </label>
                </div>

                {/* Episode Information */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Episode Information
                  </label>
                  <input
                    type="text"
                    value={episodeInfo}
                    onChange={(e) => setEpisodeInfo(e.target.value)}
                    placeholder="e.g., Episode 1 FT - Finals"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  />
                  <button
                    onClick={() => handleUpdateGameState({ episodeInfo: episodeInfo || null })}
                    className="w-full p-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
                    disabled={loading}
                  >
                    Save Episode Info
                  </button>
                  {gameState?.episodeInfo && (
                    <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                      Current: {gameState.episodeInfo}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleExportWorkbook}
                  className="w-full p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                  disabled={loading || (audienceMembers.length === 0 && timeline.length === 0)}
                >
                  📊 Download Show Excel ({audienceMembers.length} votes · {timeline.length} events)
                </button>
              </div>
            </div>

            {/* Audio Controls */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Audio Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Sound Effects</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioEnabled}
                      onChange={() => setAudioEnabled(!audioEnabled)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">Volume</span>
                    <span className="text-sm text-gray-600">{Math.round(audioVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={audioVolume}
                    onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <div>🎵 Big X: /sounds/big-x.mp3</div>
                  <div>🎵 Team Answers: /sounds/team-answer-reveal.mp3</div>
                  <div>🎵 Host Answers: /sounds/host-answer-reveal.mp3</div>
                </div>
              </div>
            </div>

            {/* Export show data */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Export Show Data</h2>
              <button
                onClick={async () => {
                  const ok = await handleExportWorkbook();
                  if (ok) alert(`Exported ${audienceMembers.length} voters and ${timeline.length} timeline events.`);
                }}
                className="w-full p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                disabled={loading}
              >
                📊 DOWNLOAD SHOW EXCEL
              </button>
              <p className="text-xs text-gray-500 mt-2">
                One .xlsx with two sheets — <strong>Audience Votes</strong> (every voter) and{' '}
                <strong>Game Timeline</strong> ({timeline.length} events, in the order they happened,
                with running scores).
              </p>
            </div>

            {/* Reset Game */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Game Reset</h2>
              <button
                onClick={handleResetGame}
                className="w-full p-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                disabled={loading}
              >
                RESET ENTIRE GAME
              </button>
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <div>Updating...</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
