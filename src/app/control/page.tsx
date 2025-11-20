'use client';

import { useEffect, useState, useRef } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';
import Papa from 'papaparse';

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
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        const questionsRef = collection(db, 'questions');
        const querySnapshot = await getDocs(questionsRef);
        const questions: Question[] = [];

        querySnapshot.forEach((doc) => {
          questions.push(doc.data() as Question);
        });

        setLoadedQuestions(questions);
      } catch (error) {
        console.error('Error loading questions from Firebase:', error);
      }
    };

    loadQuestionsFromFirebase();

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
      unsubscribeAudience();
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

      // If closing audience window, update voting results
      if (updates.audienceWindow === false) {
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

  const handleApplyRound2Bonus = async () => {
    setLoading(true);
    try {
      await gameStateManager.applyRound2Bonus();
    } catch (error) {
      console.error('Error applying Round 2 bonus:', error);
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

      // Refresh the loaded questions list after reset
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const questionsRef = collection(db, 'questions');
      const querySnapshot = await getDocs(questionsRef);
      const allQuestions: Question[] = [];

      querySnapshot.forEach((doc) => {
        allQuestions.push(doc.data() as Question);
      });

      setLoadedQuestions(allQuestions);
      console.log('Control: Game reset completed, questions refreshed');
    } catch (error) {
      console.error('Error resetting game:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (questionId: string) => {
    console.log('Control: Selecting question:', questionId);
    setLoading(true);
    try {
      // When selecting a question, reset to initial state
      await gameStateManager.updateGameState({
        currentQuestion: questionId,
        questionRevealed: false,
        revealMode: 'one-by-one',
        guessMode: false
      });
      console.log('Control: Question selected successfully');
    } catch (error) {
      console.error('Error selecting question:', error);
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
        complete: async (results) => {
          const questions: Question[] = [];
          for (const row of results.data as any[]) {
            const questionId = row.QuestionID;
            const questionText = row.QuestionText;
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

            questions.push({
              id: questionId.trim(),
              text: questionText.trim(),
              answers,
              answerCount: answers.length // Use the actual number of parsed answers
            });
          }

          // Load questions to Firebase
          for (const question of questions) {
            await gameStateManager.addQuestion(question);
          }

          // Refresh the loaded questions list
          const { collection, getDocs } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const questionsRef = collection(db, 'questions');
          const querySnapshot = await getDocs(questionsRef);
          const allQuestions: Question[] = [];
          querySnapshot.forEach((doc) => {
            allQuestions.push(doc.data() as Question);
          });
          setLoadedQuestions(allQuestions);

          alert(`Successfully loaded ${questions.length} questions!`);
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

      const question: Question = {
        id: questionId,
        text: manualQuestion.text,
        answers,
        answerCount: answers.length
      };

      await gameStateManager.addQuestion(question);

      // Refresh the loaded questions list
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const questionsRef = collection(db, 'questions');
      const querySnapshot = await getDocs(questionsRef);
      const allQuestions: Question[] = [];

      querySnapshot.forEach((doc) => {
        allQuestions.push(doc.data() as Question);
      });

      setLoadedQuestions(allQuestions);
      alert('Question added successfully!');

      // Reset form
      setManualQuestion({
        text: '',
        answers: [{ text: '', value: 0 }]
      });
    } catch (error) {
      console.error('Error adding manual question:', error);
      alert('Error adding question. Please try again.');
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
        await gameStateManager.evaluateRound1Guess(false);
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
                onChange={(e) => handleUpdateGameState({ currentRound: e.target.value as GameState['currentRound'] })}
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
                    Dugout: {team.dugoutCount + (audienceMembers.filter(m => m.team === team.id).length)}
                  </span>
                </div>
                <div className="text-xl font-bold mb-2">₹{team.score.toLocaleString()}</div>
                <div className="flex space-x-2">
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
                  <div key={index} className="flex space-x-2">
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

              {currentQuestion ? (
                <div>
                    <h3 className="font-bold text-lg mb-2">{currentQuestion.text}</h3>

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
                              if (currentQuestion) {
                                await handleRevealAllAnswers();
                              }
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
              )}
            </div>

            {gameState?.currentRound === 'round1' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">Round 1 Gameplay</h2>

                <div className="space-y-4">
                  {!gameState?.round1Active && (
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
                        const strikes = gameState?.round1Strikes?.[team.id] || 0;
                        const isOut = strikes >= 2;
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
                              {!isCurrentGuessing && isOut && (
                                <span className="text-xs font-bold text-red-500">OUT</span>
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
                                disabled={loading || isOut || isCurrentGuessing}
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

                  {gameState?.round1Active && (
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
                            {currentQuestion?.answers
                              ?.slice(0, currentQuestion.answerCount)
                              .filter((a) => !a.revealed)
                              .map((answer, index) => (
                                <option key={answer.id} value={answer.id}>
                                  #{index + 1}: {answer.text} (₹{answer.value})
                                </option>
                              ))}
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

                      <div className="flex flex-col md:flex-row md:space-x-3 space-y-2 md:space-y-0 pt-2">
                        <button
                          onClick={handleEndRound1}
                          className="flex-1 p-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                          disabled={loading}
                        >
                          END ROUND 1
                        </button>
                        <button
                          onClick={handleResetRound1Strikes}
                          className="p-3 bg-gray-500 text-white rounded-lg font-bold hover:bg-gray-600"
                          disabled={loading}
                        >
                          Reset Strikes
                        </button>
                      </div>
                    </>
                  )}
                </div>
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

            {/* Round 2 Bonus */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Round 2 Bonus</h2>
              <button
                onClick={handleApplyRound2Bonus}
                className="w-full p-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700"
                disabled={loading || gameState?.round2BonusApplied}
              >
                {gameState?.round2BonusApplied ? 'BONUS APPLIED' : 'APPLY ROUND 2 BONUS'}
              </button>
            </div>

            {/* Timer Controls */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Timer Controls</h2>
              <button
                onClick={() => {
                  if (gameState?.timerActive) {
                    // Stop the timer
                    handleUpdateGameState({ timerActive: false, timerStartTime: null });
                  } else {
                    // Start the timer
                    handleUpdateGameState({ timerActive: true, timerStartTime: Date.now() });
                  }
                }}
                className={`w-full p-3 rounded-lg font-bold text-white ${gameState?.timerActive
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
                  }`}
                disabled={loading}
              >
                {gameState?.timerActive ? 'STOP 52s TIMER' : 'START 52s TIMER'}
              </button>
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
