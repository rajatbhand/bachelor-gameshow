'use client';

import { useEffect, useState, useRef } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';
import Papa from 'papaparse';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  getDocs,
  writeBatch,
  where,
  setDoc,
  deleteDoc,
  deleteField
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ControlPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualQuestion, setManualQuestion] = useState({
    text: '',
    answers: [{ text: '', value: 0 }]
  });
  const [audienceMembers, setAudienceMembers] = useState<any[]>([]);
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>([]);
  const [round1SelectedAnswer, setRound1SelectedAnswer] = useState<string>(''); // For marking correct guess
  const [round1TeamAmounts, setRound1TeamAmounts] = useState<{ red: number; green: number; blue: number }>({
    red: 0,
    green: 0,
    blue: 0
  });
  const [round2Selection, setRound2Selection] = useState<string[]>([]);
  const [round2ManualScores, setRound2ManualScores] = useState<{ [key: string]: number }>({});
  const [episodeInfo, setEpisodeInfo] = useState('');

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

    // Set initial volume
    if (bigXAudioRef.current) bigXAudioRef.current.volume = audioVolume;
    if (teamAnswerAudioRef.current) teamAnswerAudioRef.current.volume = audioVolume;
    if (hostAnswerAudioRef.current) hostAnswerAudioRef.current.volume = audioVolume;

    // Preload audio files
    const preloadAudio = async () => {
      try {
        if (bigXAudioRef.current) await bigXAudioRef.current.load();
        if (teamAnswerAudioRef.current) await teamAnswerAudioRef.current.load();
        if (hostAnswerAudioRef.current) await hostAnswerAudioRef.current.load();
      } catch (error) {
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

    const unsubscribeQuestionsPromise = loadQuestionsFromFirebase();

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
      unsubscribeAudience();
      unsubscribeQuestionsPromise.then(unsubscribe => unsubscribe && unsubscribe());
    };
  }, []);

  const handleUpdateGameState = async (updates: Partial<GameState>) => {
    setLoading(true);
    try {
      await gameStateManager.updateGameState(updates);

      // Play Big X sound when toggling
      if (updates.bigX !== undefined && updates.bigX) {
        await playBigXSound();
      }

      // If closing audience window, increment voting round for next opening
      if (updates.audienceWindow === false) {
        const currentVotingRound = gameState?.votingRound || 1;
        await gameStateManager.updateGameState({ votingRound: currentVotingRound + 1 });

        await gameStateManager.updateAudienceVotingResults();
        // Reload audience members
        const members = await gameStateManager.getAudienceMembers();
        setAudienceMembers(members);
      }
    } catch (error) {
      console.error('Error updating game state:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealAnswer = async (answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral') => {
    if (!currentQuestion) return;

    console.log('Control: Revealing answer:', answerId, 'with attribution:', attribution);
    setLoading(true);
    try {
      await gameStateManager.revealAnswer(currentQuestion.id, answerId, attribution);
      console.log('Control: Answer revealed successfully');
    } catch (error) {
      console.error('Error revealing answer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = async (teamId: 'red' | 'green' | 'blue', change: number) => {
    setLoading(true);
    try {
      await gameStateManager.updateTeamScore(teamId, change);
    } catch (error) {
      console.error('Error updating score:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetGame = async () => {
    if (!confirm('Are you sure you want to reset the entire game?')) return;

    setLoading(true);
    try {
      console.log('Control: Starting game reset...');
      await gameStateManager.resetGame();

      // Force clear current question state
      setCurrentQuestion(null);

      // The onSnapshot listener in useEffect will automatically refresh questions
      console.log('Control: Game reset completed, questions refreshed');
    } catch (error) {
      console.error('Error resetting game:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (questionId: string) => {
    // When selecting a question, reset to initial state
    // In Round 1, Round 3, and Pre-Show, questions should be revealed by default
    const shouldRevealQuestion = ['round1', 'round3', 'pre-show'].includes(gameState?.currentRound || '');

    // Hide all answers first (fire and forget - don't block UI)
    gameStateManager.hideAllAnswers(questionId).catch((error) => {
      console.error('Error hiding answers:', error);
    });

    const updates = {
      currentQuestion: questionId,
      questionRevealed: shouldRevealQuestion, // Reveal for round1, round3, pre-show
      revealMode: 'one-by-one' as const,
      guessMode: false
    };

    // Fire and forget - don't wait for Firestore, let real-time listeners handle it
    gameStateManager.updateGameState(updates).catch((error) => {
      console.error('Error selecting question:', error);
    });
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
        complete: async (results: Papa.ParseResult<any>) => {
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
        const manualAmount = round1TeamAmounts[gameState.round1CurrentGuessingTeam] || 0;
        await gameStateManager.evaluateRound1Guess(
          true,
          round1SelectedAnswer,
          manualAmount > 0 ? manualAmount : undefined
        );
        await playTeamAnswerSound();
        setRound1SelectedAnswer(''); // Reset selection
      } else {
        // Wrong answer - evaluate and show X
        await gameStateManager.evaluateRound1Guess(false);

        // Show the big X overlay
        await gameStateManager.updateGameState({
          bigX: true
        });

        // Auto-clear the big X after 5 seconds
        setTimeout(async () => {
          try {
            await gameStateManager.updateGameState({
              bigX: false
            });
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

  const handleResetRound1Strikes = async () => {
    if (!confirm('Reset Round 1 strikes for all teams?')) return;
    setLoading(true);
    try {
      await gameStateManager.resetRound1Strikes();
      console.log('Control: Round 1 strikes reset');
    } catch (error) {
      console.error('Error resetting Round 1 strikes:', error);
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
  const handleRound2SelectOptions = async () => {
    if (round2Selection.length !== 3) {
      alert('Please select exactly 3 questions.');
      return;
    }
    setLoading(true);
    try {
      await gameStateManager.setRound2AvailableQuestions(round2Selection);
      console.log('Control: Round 2 options set:', round2Selection);
    } catch (error) {
      console.error('Error setting Round 2 options:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRound2SelectQuestion = async (questionId: string) => {
    setLoading(true);
    try {
      await gameStateManager.selectRound2Question(questionId);
      console.log('Control: Round 2 question selected:', questionId);
    } catch (error) {
      console.error('Error selecting Round 2 question:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRound2StartTimer = async () => {
    setLoading(true);
    try {
      await gameStateManager.startRound2Timer(); // 60 seconds for Round 2
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




  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between">
          {/* CSV Upload */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Upload CSV Questions</h2>
            <div className="space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="w-full p-2 border rounded"
              />
              <button
                onClick={handleCsvUpload}
                className="w-full p-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                disabled={loading || !csvFile}
              >
                UPLOAD CSV
              </button>
              <div className="flex space-x-2">
                <button
                  onClick={() => window.open('/sample-questions.csv', '_blank')}
                  className="flex-1 p-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  📥 Download Sample CSV
                </button>
              </div>
            </div>
          </div>
          {/* Header */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Game Show Control Panel</h1>

            {/* Game State Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-2">Current Round</div>
                <div className="text-xl font-bold mb-2">{gameState?.currentRound?.toUpperCase() || 'PRE-SHOW'}</div>
                <select
                  value={gameState?.currentRound || 'pre-show'}
                  onChange={(e) => {
                    const newRound = e.target.value;
                    if (newRound === 'round1') {
                      handleStartRound1();
                    } else if (newRound === 'round2') {
                      gameStateManager.startRound2();
                    } else {
                      handleUpdateGameState({ currentRound: newRound as GameState['currentRound'] });
                    }
                  }}
                  className="text-xs p-1 border rounded"
                  disabled={loading}
                >
                  <option value="pre-show">Pre-Show</option>
                  <option value="round1">Round 1</option>
                  <option value="round2">Round 2</option>
                  <option value="round3">Round 3</option>
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
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Question Bank</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadedQuestions.length > 0 ? (
                  loadedQuestions.map((question) => (
                    <button
                      key={question.id}
                      onClick={() => handleSelectQuestion(question.id)}
                      className={`w-full p-2 text-left rounded border ${gameState?.currentQuestion === question.id
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                        }`}
                      disabled={loading}
                    >
                      <div className="font-bold text-sm">{question.id}</div>
                      <div className="text-xs text-gray-600 truncate">{question.text}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No questions loaded yet. Upload CSV or add manually.
                  </div>
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
                    <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                          Step 1: Select 3 Questions for Round 2
                        </div>
                        <div className={`text-xs font-bold ${round2Selection.length === 3 ? 'text-green-600' : 'text-gray-500'}`}>
                          {round2Selection.length}/3 Selected
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
                                      if (round2Selection.length < 3) {
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
                            await gameStateManager.updateGameState({ round2State: deleteField() as any });
                            setRound2Selection([]); // Clear selection after setting
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="w-full p-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        disabled={loading || round2Selection.length !== 3}
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
                    <div>
                      <button
                        onClick={gameState.timerActive ? handleRound2StopTimer : handleRound2StartTimer}
                        className={`w-full p-2 rounded-lg font-bold text-xl shadow-sm transition-all flex items-center justify-center space-x-2 ${gameState.timerActive
                          ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                          : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                      >
                        <span>{gameState.timerActive ? 'STOP TIMER' : 'START 60s TIMER'}</span>
                      </button>
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
                        FINISH THIS TEAM'S ROUND
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
                      onChange={() => handleUpdateGameState({ audienceWindow: !gameState?.audienceWindow })}
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
                  onClick={() => {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                    gameStateManager.downloadAudienceCSV(audienceMembers, `audience-votes-${timestamp}.csv`);
                  }}
                  className="w-full p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                  disabled={loading || audienceMembers.length === 0}
                >
                  📥 Download Votes CSV ({audienceMembers.length})
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
