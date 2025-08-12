'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';

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

  // Show score animation when scores change
  useEffect(() => {
    if (teams.length > 0) {
      const totalScore = teams.reduce((sum, team) => sum + team.score, 0);
      if (totalScore > 0) {
        setScoreAnimation({ show: true, amount: totalScore, team: 'all' });
        setTimeout(() => setScoreAnimation({ show: false, amount: 0, team: '' }), 3000);
      }
    }
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
            {teams.map((team) => (
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
              </div>
            ))}
          </div>
        </div>
        
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
        {currentQuestion ? (
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
          <div className="text-center">
            <h2 className="text-4xl font-bold mb-4">No Question Selected</h2>
            <p className="text-xl text-gray-400">Please select a question from the control panel</p>
          </div>
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
    </div>
  );
}
