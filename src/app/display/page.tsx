'use client';

import { useState, useEffect, useRef } from 'react';
import { gameStateManager } from '@/lib/gameState';
import type { GameState, Question, Team } from '@/lib/gameState';
import React from 'react';
import { Bebas_Neue } from 'next/font/google';
import confetti from 'canvas-confetti';
// import { doc, getDoc } from 'firebase/firestore'; // Not needed as we use manager

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

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
  const [teamSwitchers, setTeamSwitchers] = useState<Array<{ name: string; upiId: string; previousTeam: 'red' | 'green' | 'blue'; currentTeam: 'red' | 'green' | 'blue' }>>([]);
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
      // Update team switchers when audience members change
      gameStateManager.getTeamSwitchers().then(setTeamSwitchers).catch(console.error);
    });

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
      unsubscribeAudience();
    };
  }, []);

  // Confetti effect when end show screen is displayed
  useEffect(() => {
    if (gameState?.showEndScreen) {
      // Fire confetti celebration
      const duration = 5000; // 5 seconds
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval: NodeJS.Timeout = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        // Fire confetti from multiple positions
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [gameState?.showEndScreen]);

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
    <div className={`min-h-screen bg-gray-900 text-white ${bebas.className}`}>
      {/* Header with Round and Teams */}
      <div className="bg-gray-800 p-4">
        <div className="flex justify-between items-center">

          {/* Team "IS GUESSING" Banner - Works for Pre-Show, Round 1, Round 2, Round 3 */}
          <div className="flex justify-center">
            {(['pre-show', 'round1', 'round2', 'round3'].includes(gameState?.currentRound || '')) &&
              (gameState?.round1CurrentGuessingTeam || gameState?.round2CurrentTeam) && (
                <div className="flex justify-center">
                  <div
                    className="px-8 py-2 rounded-lg shadow-2xl animate-pulse"
                    style={{
                      backgroundColor: teams.find(t => t.id === (gameState.round1CurrentGuessingTeam || gameState.round2CurrentTeam))?.color || '#6b21a8'
                    }}
                  >
                    <div className="text-white text-4xl font-bold tracking-wide">
                      🎤 {teams.find(t => t.id === (gameState.round1CurrentGuessingTeam || gameState.round2CurrentTeam))?.name.toUpperCase()} IS PLAYING
                    </div>
                  </div>
                </div>
              )}
          </div>

          <div className="flex space-x-8">
            {teams.map((team) => {
              return (
                <div key={team.id} className="text-center">
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold tracking-wide" style={{ color: team.color }}>{team.name}</div>
                    <div className="text-3xl font-bold tracking-wide">₹{team.score.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl tracking-wide text-gray-400">Dugout:</div>
                    <div className="text-2xl font-bold tracking-wide ml-12">{team.dugoutCount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>



        {/* Team Switchers Display - Only show when voting is open */}
        {gameState?.audienceWindow && teamSwitchers.length > 0 && (() => {
          // Aggregate switchers by team transition
          const switchCounts: Record<string, number> = {};
          teamSwitchers.forEach(switcher => {
            const key = `${switcher.previousTeam}->${switcher.currentTeam}`;
            switchCounts[key] = (switchCounts[key] || 0) + 1;
          });

          return (
            <div className="mt-4">
              <div className="bg-gray-700 rounded-lg p-4 max-w-4xl mx-auto">
                {/* Audience Voting Status */}
                {gameState?.audienceWindow && (
                  <div className="text-center flex items-center justify-between mb-2">
                    <h3 className="text-3xl font-bold text-center text-yellow-400 tracking-wide">🔄 VOTE SHIFTS</h3>
                    <div className="text-white flex items-center gap-2">
                      <div className="w-4 h-4 animate-pulse rounded-full bg-green-600"></div>
                      <div className="text-3xl tracking-wide font-bold"> AUDIENCE VOTING OPEN</div>
                      <div className="tracking-wide text-3xl">({audienceMembers.length} submissions)</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(switchCounts).map(([transition, count]) => {
                    const [prevTeamId, currTeamId] = transition.split('->');
                    const prevTeam = teams.find(t => t.id === prevTeamId);
                    const currTeam = teams.find(t => t.id === currTeamId);

                    const teamColors: { [key: string]: string } = {
                      red: '#ef4444',
                      green: '#22c55e',
                      blue: '#3b82f6'
                    };

                    return (
                      <div key={transition} className="bg-gray-800 rounded p-3 text-center">
                        <div className="text-2xl font-semibold tracking-wide flex items-center justify-center gap-2">
                          <div style={{ color: teamColors[prevTeamId] || prevTeam?.color }}>{prevTeam?.name.toUpperCase()}</div>
                          <div className="text-white">➡️</div>
                          <div style={{ color: teamColors[currTeamId] || currTeam?.color }}>{currTeam?.name.toUpperCase()}</div>
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <div className="text-2xl text-gray-400 tracking-wide">{count === 1 ? 'VOTE' : 'VOTES'}</div>
                          <div className="text-2xl font-bold text-white tracking-wide">{count}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
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
                    <div className="text-2xl font-bold text-white leading-relaxed">{q.displayText || q.text}</div>
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
                <div className={`grid grid-cols-3 gap-4 ${currentQuestion.answerCount === 7 ? '[&>*:last-child]:col-start-2' : ''}`}>
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
                            <div className="text-lg font-semibold text-green-400">₹{answer.value.toLocaleString()}</div>
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-8 max-w-6xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-5xl font-bold text-center mb-8 text-white tracking-wide">SCOREBOARD</h2>
              <p className="text-3xl font-bold text-white tracking-wide">Total Votes: {audienceMembers.length}</p>
            </div>


            {/* Team Scores, Dugout, and Vote Shifts */}
            <div className="grid grid-cols-3 gap-8 mb-8">
              {teams.map((team) => {
                // Calculate vote shifts for this team
                const shiftsToThisTeam = teamSwitchers.filter(s => s.currentTeam === team.id && s.previousTeam !== team.id);
                const shiftsFromThisTeam = teamSwitchers.filter(s => s.previousTeam === team.id && s.currentTeam !== team.id);

                // Group shifts by source/destination team
                const shiftsIn: { [key: string]: number } = {};
                const shiftsOut: { [key: string]: number } = {};

                shiftsToThisTeam.forEach(s => {
                  shiftsIn[s.previousTeam] = (shiftsIn[s.previousTeam] || 0) + 1;
                });

                shiftsFromThisTeam.forEach(s => {
                  shiftsOut[s.currentTeam] = (shiftsOut[s.currentTeam] || 0) + 1;
                });

                const teamColors: { [key: string]: string } = {
                  red: '#ef4444',
                  green: '#22c55e',
                  blue: '#3b82f6'
                };

                return (
                  <div key={team.id} className="text-center bg-gray-800 rounded-lg p-6">
                    <div className='flex items-end justify-between mb-4'>
                      <div className="text-4xl font-bold tracking-wide" style={{ color: team.color }}>
                        {team.name.toUpperCase()}
                      </div>
                      <div className="text-5xl font-bold text-white tracking-wider">₹{team.score.toLocaleString()}</div>
                    </div>
                    {/* Dugout Count */}
                    <div className="bg-gray-700 rounded-lg p-3 flex items-end justify-between">
                      <div className="text-3xl text-white">DUGOUT</div>
                      <div className="text-3xl font-bold tracking-wide" style={{ color: team.color }}>
                        {team.dugoutCount} {team.dugoutCount === 1 ? 'vote' : 'votes'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Vote Shift Overlay */}
      {gameState?.voteShiftOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-8 max-w-6xl w-full mx-4 max-h-screen overflow-y-auto">
            <h2 className="text-6xl font-bold text-center mb-8 text-yellow-400 tracking-wide">🔄 VOTE SHIFTS</h2>

            {/* Team Vote Shifts */}
            <div className="grid grid-cols-3 gap-8 mb-8">
              {teams.map((team) => {
                // Calculate vote shifts for this team
                const shiftsToThisTeam = teamSwitchers.filter(s => s.currentTeam === team.id && s.previousTeam !== team.id);

                // Group shifts by source team
                const shiftsIn: { [key: string]: number } = {};

                shiftsToThisTeam.forEach(s => {
                  shiftsIn[s.previousTeam] = (shiftsIn[s.previousTeam] || 0) + 1;
                });

                const teamColors: { [key: string]: string } = {
                  red: '#ef4444',
                  green: '#22c55e',
                  blue: '#3b82f6'
                };

                return (
                  <div key={team.id} className="text-center bg-gray-800 rounded-lg p-6">
                    <div className="text-5xl font-bold mb-4 tracking-wide" style={{ color: team.color }}>
                      {team.name.toUpperCase()}
                    </div>

                    {/* Dugout Count */}
                    <div className="bg-gray-700 rounded-lg p-3 flex items-end justify-between mb-4">
                      <div className="text-3xl text-white">DUGOUT</div>
                      <div className="text-3xl font-bold tracking-wide" style={{ color: team.color }}>
                        {team.dugoutCount} {team.dugoutCount === 1 ? 'vote' : 'votes'}
                      </div>
                    </div>

                    {/* Vote Shifts for this team */}
                    {Object.keys(shiftsIn).length > 0 ? (
                      <div className="bg-gray-700 rounded-lg p-4 space-y-3">

                        {Object.entries(shiftsIn).map(([fromTeam, count]) => (
                          <div key={`in-${fromTeam}`} className="text-3xl font-semibold tracking-wide flex items-center justify-center gap-2">
                            <div style={{ color: teamColors[fromTeam] }}>{fromTeam.toUpperCase()}</div>
                            <div className="text-white">➡️</div>
                            <div style={{ color: team.color }}>{team.name.toUpperCase()}</div>
                            <div className="text-white ml-2">({count})</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-700 rounded-lg p-4">
                        <div className="text-2xl text-gray-400 tracking-wide">No vote shifts</div>
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* End Show Screen */}
      {gameState?.showEndScreen && (() => {
        // Calculate winning team
        const winningTeam = teams.reduce((prev, current) =>
          (current.score > prev.score) ? current : prev
          , teams[0]);

        const divisibleAmount = winningTeam.dugoutCount > 0
          ? Math.floor(winningTeam.score / winningTeam.dugoutCount)
          : 0;

        return (
          <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center z-50 p-8">
            <div className="text-center max-w-4xl">
              <div className="text-7xl font-black text-white mb-8 animate-pulse">
                🎉 THANK YOU FOR PLAYING! 🎉
              </div>

              <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-3xl p-12 mb-8 border-4 border-white border-opacity-30">
                <div className="text-5xl font-bold text-yellow-400 mb-6">
                  🏆 WINNER 🏆
                </div>

                <div
                  className="text-8xl font-black mb-8"
                  style={{ color: winningTeam.color }}
                >
                  {winningTeam.name.toUpperCase()} TEAM
                </div>

                <div className="grid grid-cols-2 gap-8 text-white">
                  <div className="bg-white bg-opacity-20 rounded-2xl p-6">
                    <div className="text-3xl font-semibold mb-3">Total Players</div>
                    <div className="text-6xl font-black" style={{ color: winningTeam.color }}>
                      {winningTeam.dugoutCount}
                    </div>
                  </div>

                  <div className="bg-white bg-opacity-20 rounded-2xl p-6">
                    <div className="text-3xl font-semibold mb-3">Divisible Amount</div>
                    <div className="text-6xl font-black text-green-400">
                      ₹{divisibleAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-5xl font-bold text-white animate-bounce">
                Thank you for playing with us! ❤️
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
