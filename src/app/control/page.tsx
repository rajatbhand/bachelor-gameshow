'use client';

import { useEffect, useState, useRef } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';

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
  const [manualAmounts, setManualAmounts] = useState<{ [key: string]: number }>({});

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

  const handleHideAnswer = async (answerId: string) => {
    if (!currentQuestion) return;
    
    setLoading(true);
    try {
      await gameStateManager.hideAnswer(currentQuestion.id, answerId);
    } catch (error) {
      console.error('Error hiding answer:', error);
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
    
    setLoading(true);
    try {
      const text = await csvFile.text();
      const lines = text.split('\n');
      const questions: Question[] = [];
      
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',');
        if (columns.length < 4) continue;
        
        const questionId = columns[0];
        const questionText = columns[1];
        const answerCount = parseInt(columns[2]) || 10;
        
        const answers = [];
        for (let j = 0; j < answerCount; j++) {
          const answerText = columns[3 + j * 2] || '';
          const answerValue = parseInt(columns[4 + j * 2]) || 0;
          
          if (answerText) {
            answers.push({
              id: `${questionId}_answer_${j + 1}`,
              text: answerText,
              value: answerValue,
              revealed: false,
              attribution: null
            });
          }
        }
        
        questions.push({
          id: questionId,
          text: questionText,
          answers,
          answerCount
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
    } catch (error) {
      console.error('Error uploading CSV:', error);
      alert('Error uploading CSV. Please check the format.');
    } finally {
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

  const handleManualAmountChange = (answerId: string, amount: number) => {
    setManualAmounts(prev => ({
      ...prev,
      [answerId]: amount
    }));
  };

  const handleRevealAnswerWithAmount = async (answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral') => {
    if (!currentQuestion) return;
    
    console.log('Control: Revealing answer:', answerId, 'with attribution:', attribution);
    setLoading(true);
    try {
      // Get the manual amount for this answer, or use the original value
      const manualAmount = manualAmounts[answerId] || 0;
      
      await gameStateManager.revealAnswer(currentQuestion.id, answerId, attribution, manualAmount);
      console.log('Control: Answer revealed successfully');
      
      // Play appropriate sound based on attribution
      if (attribution === 'host') {
        await playHostAnswerSound();
      } else if (['red', 'green', 'blue'].includes(attribution)) {
        await playTeamAnswerSound();
      }
    } catch (error) {
      console.error('Error revealing answer:', error);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Game Show Control Panel</h1>
          
          {/* Game State Overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-sm text-gray-600">Current Round</div>
              <div className="text-xl font-bold">{gameState?.currentRound?.toUpperCase() || 'PRE-SHOW'}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600">Big X</div>
              <div className={`text-xl font-bold ${gameState?.bigX ? 'text-red-600' : 'text-gray-400'}`}>
                {gameState?.bigX ? 'ON' : 'OFF'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600">Scorecard</div>
              <div className={`text-xl font-bold ${gameState?.scorecardOverlay ? 'text-green-600' : 'text-gray-400'}`}>
                {gameState?.scorecardOverlay ? 'SHOWING' : 'HIDDEN'}
              </div>
            </div>
          </div>

          {/* Team Scores and Audience Voting Combined */}
          <div className="grid grid-cols-3 gap-4">
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

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Question Management */}
          <div className="space-y-6">
                         {/* CSV Upload */}
             <div className="bg-white rounded-lg shadow-md p-6">
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
                 <div className="text-xs text-gray-600">
                   CSV Format: QuestionID,QuestionText,AnswerCount,Answer1,Value1,Answer2,Value2,...
                 </div>
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
                  onChange={(e) => setManualQuestion({...manualQuestion, text: e.target.value})}
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

            {/* Loaded Questions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Question Bank</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadedQuestions.length > 0 ? (
                  loadedQuestions.map((question) => (
                    <button
                      key={question.id}
                      onClick={() => handleSelectQuestion(question.id)}
                      className={`w-full p-2 text-left rounded border ${
                        gameState?.currentQuestion === question.id
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
          </div>

          {/* Middle Column - Current Question and Answers */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Current Question</h2>
            
            {currentQuestion ? (
              <div>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-bold text-lg mb-2">{currentQuestion.text}</h3>
                  
                                     {/* Question Reveal Controls */}
                   {!gameState?.questionRevealed ? (
                     <div className="mt-4 space-y-3">
                       <div className="text-sm text-gray-600 mb-3">
                         Question is hidden on display. Choose how to proceed:
                       </div>
                       <div className="flex space-x-2">
                         <button
                           onClick={() => handleUpdateGameState({ 
                             questionRevealed: true, 
                             revealMode: 'one-by-one' 
                           })}
                           className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 font-medium"
                           disabled={loading}
                         >
                           Reveal Question (One by One)
                         </button>
                                                  <button
                            onClick={async () => {
                              await handleUpdateGameState({ 
                                questionRevealed: false, 
                                revealMode: 'all-at-once',
                                guessMode: true
                              });
                              // Also reveal all answers in Firestore
                              if (currentQuestion) {
                                await handleRevealAllAnswers();
                              }
                            }}
                            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 font-medium"
                            disabled={loading}
                          >
                            Reveal All Answers (Guess Mode)
                          </button>
                       </div>
                       
                       {/* Show Reveal Question button when in guess mode */}
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
                      
                      {/* Reveal Mode Controls */}
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Reveal Mode:</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdateGameState({ revealMode: 'one-by-one' })}
                            className={`px-3 py-1 rounded text-xs font-medium ${
                              gameState?.revealMode === 'one-by-one'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            disabled={loading}
                          >
                            One by One
                          </button>
                          <button
                            onClick={() => handleUpdateGameState({ revealMode: 'all-at-once' })}
                            className={`px-3 py-1 rounded text-xs font-medium ${
                              gameState?.revealMode === 'all-at-once'
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
                           
                           {/* Show Reveal Question button when in guess mode and answers are revealed */}
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

                <div className="space-y-3">
                  {currentQuestion.answers.slice(0, currentQuestion.answerCount).map((answer, index) => (
                    <div key={answer.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold">#{index + 1}</span>
                        <span className="text-sm text-gray-600">₹{answer.value}</span>
                      </div>
                      
                      {/* Always show the answer text to the operator */}
                      <div className="font-bold text-lg mb-2">{answer.text}</div>
                      
                                             {gameState?.questionRevealed && gameState?.revealMode === 'one-by-one' ? (
                         answer.revealed ? (
                           <div className="space-y-2">
                             <div className="text-sm text-green-600 font-semibold">
                               ✓ Revealed by: {answer.attribution?.toUpperCase() || 'UNKNOWN'}
                             </div>
                             <button
                               onClick={() => handleHideAnswer(answer.id)}
                               className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                               disabled={loading}
                             >
                               Hide Answer
                             </button>
                           </div>
                         ) : (
                           <div className="space-y-2">
                             <div className="text-sm text-gray-500 mb-2">Not revealed yet</div>
                             
                             {/* Manual Amount Input */}
                             <div className="flex items-center space-x-2 mb-2">
                               <label className="text-sm text-gray-600">Manual Amount:</label>
                               <input
                                 type="number"
                                 placeholder="Enter amount"
                                 value={manualAmounts[answer.id] || ''}
                                 onChange={(e) => handleManualAmountChange(answer.id, parseInt(e.target.value) || 0)}
                                 className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                 min="0"
                               />
                               <span className="text-xs text-gray-500">₹</span>
                             </div>
                             
                             <div className="flex flex-wrap gap-1">
                               {(['red', 'green', 'blue', 'host', 'neutral'] as const).map((attribution) => (
                                 <button
                                   key={attribution}
                                   onClick={() => handleRevealAnswerWithAmount(answer.id, attribution)}
                                   className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                                   disabled={loading}
                                 >
                                   {attribution.toUpperCase()}
                                 </button>
                               ))}
                             </div>
                           </div>
                         )
                       ) : (
                         <div className="space-y-2">
                           <div className={`text-sm font-semibold ${
                             answer.revealed ? 'text-green-600' : 'text-gray-500'
                           }`}>
                             {answer.revealed ? '✓ Revealed' : 'Hidden'}
                           </div>
                         </div>
                       )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No question selected
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
