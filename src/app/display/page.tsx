'use client';

import { useEffect, useState, useRef } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';
import React from 'react';
// import { doc, getDoc } from 'firebase/firestore'; // Not needed as we use manager

// Custom hook to store the previous value of a state or prop
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export default function DisplayPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [audienceMembers, setAudienceMembers] = useState<any[]>([]);
  const [scoreAnimation, setScoreAnimation] = useState<{ show: boolean; amount: number; team: string }>({
    show: false,
    amount: 0,
    team: ''
  });

  // --- TIMER ANIMATION STATE ---
  const [timeLeft, setTimeLeft] = useState(60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- ROUND 2 STATE ---
  const [round2Options, setRound2Options] = useState<Question[]>([]);

  useEffect(() => {
    const fetchRound2Options = async () => {
      if (gameState?.currentRound === 'round2' &&
        gameState?.round2Options && gameState.round2Options.length > 0) {

        try {
          const questions = await gameStateManager.getQuestionsByIds(gameState.round2Options);
          setRound2Options(questions);
        } catch (error) {
          console.error("Error fetching Round 2 options:", error);
        }
      } else {
        setRound2Options([]);
      }
    };

    fetchRound2Options();
  }, [gameState?.currentRound, gameState?.round2Options]);

  // --- AUDIO SETUP START ---
  const bigXAudioRef = useRef<HTMLAudioElement | null>(null);
  const teamAnswerAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostAnswerAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio elements on the client
    bigXAudioRef.current = new Audio('/sounds/big-x.mp3');
    teamAnswerAudioRef.current = new Audio('/sounds/team-answer-reveal.mp3');
    hostAnswerAudioRef.current = new Audio('/sounds/host-answer-reveal.mp3');

    // Preload audio files for instant playback
    const preloadAudio = async () => {
      try {
        if (bigXAudioRef.current) await bigXAudioRef.current.load();
        if (teamAnswerAudioRef.current) await teamAnswerAudioRef.current.load();
        if (hostAnswerAudioRef.current) await hostAnswerAudioRef.current.load();
      } catch (error) {
        console.log('Display Audio: Could not preload sounds. They will load on first play.');
      }
    };
    preloadAudio();
  }, []);

  const playSound = async (audioRef: React.RefObject<HTMLAudioElement>) => {
    if (!audioRef.current) return;
    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch (error) {
      console.error('Display Audio: Error playing sound:', error);
    }
  };

  const prevGameState = usePrevious(gameState);
  const prevCurrentQuestion = usePrevious(currentQuestion);

  useEffect(() => {
    // Play Big X sound when it's toggled on
    if (gameState && prevGameState && !prevGameState.bigX && gameState.bigX) {
      playSound(bigXAudioRef);
    }

    // Play sound when an answer is revealed
    if (currentQuestion && prevCurrentQuestion && currentQuestion.id === prevCurrentQuestion.id) {
      for (let i = 0; i < currentQuestion.answers.length; i++) {
        const currentAnswer = currentQuestion.answers[i];
        const prevAnswer = prevCurrentQuestion.answers[i];

        if (prevAnswer && !prevAnswer.revealed && currentAnswer.revealed) {
          // This answer was just revealed
          if (currentAnswer.attribution === 'host' || currentAnswer.attribution === 'neutral') {
            playSound(hostAnswerAudioRef);
          } else if (['red', 'green', 'blue'].includes(currentAnswer.attribution!)) {
            playSound(teamAnswerAudioRef);
          }
        }
      }
    }
  }, [gameState, currentQuestion, prevGameState, prevCurrentQuestion]);
  // --- AUDIO SETUP END ---

  // --- TIMER LOGIC ---
  const [timesUp, setTimesUp] = useState(false);

  useEffect(() => {
    if (gameState?.timerActive && gameState.timerStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.timerStartTime!) / 1000);
        const remaining = Math.max(0, gameState.timerDuration - elapsed);

        setTimeLeft(remaining);

        if (remaining === 0) {
          setTimesUp(true);
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 250); // Check 4 times a second for accuracy
    } else {
      // Reset timer visuals when it's not active
      setTimeLeft(gameState?.timerDuration || 60);
      setTimesUp(false);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.timerActive, gameState?.timerStartTime, gameState?.timerDuration]);

  // Team colors mapping
  const TEAM_COLORS: { [key: string]: string } = {
    'red': '#ef4444', // red
    'green': '#22c55e', // green
    'blue': '#3b82f6', // blue
    'host': '#6b7280', // host (gray)
    'all': '#22c55e' // default green for total score
  };

  // Format INR currency
  const formatInr = (amount: number) => {
    return `₹${amount.toLocaleString()}`;
  };

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribeGameState = gameStateManager.subscribeToGameState((state) => {
      setGameState(state);
    });

    const unsubscribeTeams = gameStateManager.subscribeToTeams((teamsData) => {
      setTeams(teamsData);
    });

    const unsubscribeQuestion = gameStateManager.subscribeToCurrentQuestion((question) => {
      setCurrentQuestion(question);
    });

    // Subscribe to audience members
    const unsubscribeAudience = gameStateManager.subscribeToAudienceMembers((members) => {
      setAudienceMembers(members);
    });

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
      unsubscribeAudience();
    };
  }, []);

  // Show score animation when individual team scores change
  const prevScoresRef = React.useRef<Record<string, number>>({});
  useEffect(() => {
    if (teams.length === 0) return;
    teams.forEach((team) => {
      const prev = prevScoresRef.current[team.id] ?? 0;
      const diff = team.score - prev;
      if (diff > 0) {
        // Animate the amount added for this team
        setScoreAnimation({ show: true, amount: diff, team: team.id });
        setTimeout(() => setScoreAnimation({ show: false, amount: 0, team: '' }), 3000);
      }
      // Update stored score
      prevScoresRef.current[team.id] = team.score;
    });
  }, [teams]);

  // Show logo only screen
  if (gameState?.logoOnly) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <img
            src="/WhatsApp Image 2025-08-12 at 15.56.07_32a23c23.jpg"
            alt="Akal Ke Ghode"
            className="w-96 h-96 mx-auto object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header with Round and Teams */}
      <div className="bg-gray-800 p-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold">
            Round: {gameState?.currentRound?.toUpperCase() || 'PRE-SHOW'}
          </div>
          <div className="flex space-x-8">
            {teams.map((team) => {
              const strikes = gameState?.round1Strikes?.[team.id] || 0;
              const isOut = strikes >= 2;
              return (
                <div key={team.id} className="text-center">
                  <div
                    className="text-lg font-bold"
                    style={{ color: team.color }}
                  >
                    {team.name}
                  </div>
                  <div className="text-3xl font-bold">₹{team.score.toLocaleString()}</div>
                  <div className="text-sm text-gray-400">
                    Dugout: {team.dugoutCount}
                    {audienceMembers.length > 0 && (
                      <span className="text-yellow-400"> ({audienceMembers.filter(m => m.team === team.id).length} votes)</span>
                    )}
                  </div>
                  {/* Round 1 Strikes Display */}
                  {gameState?.currentRound === 'round1' && (
                    <div className="mt-2 flex items-center justify-center space-x-1">
                      <span className={strikes >= 1 ? 'text-gray-400 text-xl' : 'text-red-500 text-xl'}>❤️</span>
                      <span className={strikes >= 2 ? 'text-gray-400 text-xl' : 'text-red-500 text-xl'}>❤️</span>
                      {isOut && (
                        <span className="ml-2 text-xs text-red-400 font-bold">OUT</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Team "IS GUESSING" Banner - Works for Pre-Show, Round 1, Round 2, Round 3 */}
        {(['pre-show', 'round1', 'round2', 'round3'].includes(gameState?.currentRound || '')) &&
          (gameState?.round1CurrentGuessingTeam || gameState?.round2CurrentTeam) && (
            <div className="fixed top-20 left-0 right-0 z-20 flex justify-center">
              <div
                className="px-8 py-2 rounded-lg shadow-2xl animate-pulse"
                style={{
                  backgroundColor: teams.find(t => t.id === (gameState.round1CurrentGuessingTeam || gameState.round2CurrentTeam))?.color || '#6b21a8'
                }}
              >
                <div className="text-white text-xl font-black tracking-normal">
                  🎤 {teams.find(t => t.id === (gameState.round1CurrentGuessingTeam || gameState.round2CurrentTeam))?.name.toUpperCase()} IS PLAYING
                </div>
              </div>
            </div>
          )}

        {/* Audience Voting Status */}
        {gameState?.audienceWindow && (
          <div className="mt-4 text-center">
            <div className="bg-green-600 text-white px-4 py-2 rounded-lg inline-block">
              <span className="font-bold">🗳️ AUDIENCE VOTING OPEN</span>
              <span className="ml-2">({audienceMembers.length} submissions)</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-8">

        {/* ROUND 2 SELECTION PHASE */}
        {gameState?.currentRound === 'round2' && round2Options.length > 0 && !gameState?.round2State && (
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-12 text-indigo-300">Choose Your Question</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {round2Options.map((q) => (
                <div key={q.id} className="bg-indigo-900/50 border-4 border-indigo-500 rounded-xl p-8 flex items-center justify-center min-h-[300px] transform hover:scale-105 transition-transform duration-300 shadow-2xl">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white leading-relaxed">{q.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STANDARD QUESTION DISPLAY (Round 1 & Round 2 Question/Reveal Phases) */}
        {(!gameState?.round2State || gameState.round2State.phase !== 'selection') && (
          currentQuestion ? (
            <div className="max-w-6xl mx-auto">
              {/* Round 2 Team Banner */}
              {gameState?.currentRound === 'round2' && gameState.round2CurrentTeam && (
                <div className="text-center mb-6 p-6 bg-black bg-opacity-40 rounded-xl">
                  <div className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Playing Now</div>
                  <div
                    className="text-5xl font-black tracking-wider"
                    style={{
                      color: teams.find(t => t.id === gameState.round2CurrentTeam)?.color
                    }}
                  >
                    {teams.find(t => t.id === gameState.round2CurrentTeam)?.name}
                  </div>
                </div>
              )}

              {/* Question */}
              <div className="bg-gray-800 rounded-lg p-6 mb-8">
                {gameState?.questionRevealed ? (
                  <>
                    <h2 className="text-3xl font-bold text-center mb-4">{currentQuestion.text}</h2>

                    {/* Guess Mode Indicator - Only show when in guess mode */}
                    {gameState?.revealMode === 'all-at-once' && gameState?.guessMode && (
                      <div className="text-center">
                        <div className="inline-flex items-center space-x-4 bg-gray-700 rounded-lg px-4 py-2">
                          <span className="text-sm text-yellow-400 font-bold">
                            🎯 GUESS THE QUESTION
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center">
                    {gameState?.revealMode === 'all-at-once' && gameState?.guessMode ? (
                      <>
                        <div className="text-6xl font-bold text-yellow-400 mb-4">🎯</div>
                        <h2 className="text-2xl text-yellow-300">Guess the Question!</h2>
                        <p className="text-lg text-gray-400 mt-2">Look at the answers below and try to guess what the question is</p>
                      </>
                    ) : (
                      <>
                        <div className="text-6xl font-bold text-gray-400 mb-4">?</div>
                        <h2 className="text-2xl text-gray-300">Question Hidden</h2>
                        <p className="text-lg text-gray-400 mt-2">Operator will reveal question or answers</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Answers Grid */}
              {(gameState?.questionRevealed || (gameState?.revealMode === 'all-at-once' && gameState?.guessMode)) && (
                <div className="grid grid-cols-3 gap-4">
                  {currentQuestion.answers.slice(0, currentQuestion.answerCount).map((answer, index) => (
                    <div
                      key={answer.id}
                      className="relative h-32 bg-gray-800 border-4 rounded-lg shadow-xl transition-all duration-500"
                      style={{
                        borderColor: answer.revealed
                          ? (gameState?.revealMode === 'all-at-once'
                            ? '#6b7280' // Neutral gray for all-at-once mode
                            : (answer.attribution === 'red' ? '#ef4444' :
                              answer.attribution === 'green' ? '#22c55e' :
                                answer.attribution === 'blue' ? '#3b82f6' :
                                  answer.attribution === 'host' ? '#6b7280' : '#6b7280'))
                          : '#4B5563'
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        {answer.revealed ? (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-white">{answer.text}</div>
                            {/*<div className="text-lg font-semibold text-green-400">₹{answer.value.toLocaleString()}</div>*/}
                          </div>
                        ) : (
                          <div className="text-4xl font-bold text-gray-400">?</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Don't show "No Question Selected" for Round 2 */
            gameState?.currentRound !== 'round2' && (
              <div className="text-center">
                <h2 className="text-4xl font-bold mb-4">No Question Selected</h2>
                <p className="text-xl text-gray-400">Please select a question from the control panel</p>
              </div>
            )
          )
        )}
      </div>

      {/* Big X Overlay */}
      {gameState?.bigX && (
        <div className="fixed inset-0 z-40 bg-red-900/80 flex items-center justify-center">
          <div className="relative">
            <div className="text-red-100 text-[25vw] font-black select-none animate-pulse drop-shadow-2xl">
              ✗
            </div>
            <div className="absolute inset-0 text-red-600 text-[25vw] font-black select-none animate-ping">
              ✗
            </div>
          </div>
        </div>
      )}

      {/* Scorecard Overlay */}
      {gameState?.scorecardOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-4xl w-full mx-4">
            <h2 className="text-4xl font-bold text-center mb-8">FINAL SCORES</h2>
            <div className="grid grid-cols-3 gap-8">
              {teams.map((team) => (
                <div key={team.id} className="text-center">
                  <div className="text-3xl font-bold mb-2" style={{ color: team.color }}>
                    {team.name}
                  </div>
                  <div className="text-6xl font-bold">₹{team.score.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Score Animation Overlay */}
      {scoreAnimation.show && scoreAnimation.amount > 0 && ['red', 'green', 'blue', 'host', 'all'].includes(scoreAnimation.team) && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="relative">
            <div
              className="text-6xl md:text-8xl font-black animate-bounce drop-shadow-2xl"
              style={{ color: TEAM_COLORS[scoreAnimation.team] }}
            >
              +{formatInr(scoreAnimation.amount)}
            </div>
            <div className="absolute inset-0 bg-white text-black text-6xl md:text-8xl font-black animate-ping opacity-50">
              +{formatInr(scoreAnimation.amount)}
            </div>
          </div>
        </div>
      )}

      {/* Timer Bar */}
      {gameState?.timerActive && (
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-black bg-opacity-80 flex items-center justify-center p-4 z-30 overflow-hidden">
          <div className="text-center">
            <div className="text-7xl font-black text-white">
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
            <div className="text-sm text-gray-400 mt-2">TIME REMAINING</div>
          </div>
        </div>
      )}

      {/* TIME'S UP Overlay for Round 2 */}
      {timesUp && gameState?.currentRound === 'round2' && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="text-center animate-pulse">
            <div className="text-9xl font-black text-yellow-400 mb-4">⏰</div>
            <div className="text-8xl font-black text-white">TIME'S UP!</div>
          </div>
        </div>
      )}
    </div>
  );
}
