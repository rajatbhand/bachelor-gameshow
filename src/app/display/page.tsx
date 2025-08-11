'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';

export default function DisplayPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scoreBump] = useState<{ team: string; amount: number } | null>(null);

  useEffect(() => {
    // Initialize game
    gameStateManager.initializeGame();

    // Subscribe to real-time updates
    const unsubscribeGameState = gameStateManager.subscribeToGameState(setGameState);
    const unsubscribeTeams = gameStateManager.subscribeToTeams(setTeams);
    const unsubscribeQuestion = gameStateManager.subscribeToCurrentQuestion(setCurrentQuestion);

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
    };
  }, []);

  // Show logo screen
  if (gameState?.logoOnly) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-8xl font-bold text-white mb-4">BACHELOR GAME SHOW</h1>
          <p className="text-2xl text-gray-300">Get Ready for the Fun!</p>
        </div>
      </div>
    );
  }

  // Show Big X overlay
  if (gameState?.bigX) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-9xl font-bold mb-8">✗</div>
          <h2 className="text-6xl text-white font-bold">WRONG ANSWER!</h2>
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
                  className={`text-lg font-bold ${gameState?.activeTeam === team.id ? 'text-yellow-400' : ''}`}
                  style={{ color: team.color }}
                >
                  {team.name}
                </div>
                <div className="text-3xl font-bold">₹{team.score.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Dugout: {team.dugoutCount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8">
        {currentQuestion ? (
          <div className="max-w-6xl mx-auto">
            {/* Question */}
            <div className="bg-gray-800 rounded-lg p-6 mb-8">
              <h2 className="text-3xl font-bold text-center mb-4">{currentQuestion.text}</h2>
            </div>

            {/* Answers Grid */}
            <div className="grid grid-cols-3 gap-4">
              {currentQuestion.answers.slice(0, currentQuestion.answerCount).map((answer, index) => (
                <div
                  key={answer.id}
                  className={`relative h-32 rounded-lg border-4 transition-all duration-300 ${
                    answer.revealed
                      ? 'bg-white text-black'
                      : 'bg-gray-700 border-gray-600'
                  }`}
                  style={{
                    borderColor: answer.revealed 
                      ? (answer.attribution === 'red' ? '#ef4444' : 
                         answer.attribution === 'green' ? '#22c55e' : 
                         answer.attribution === 'blue' ? '#3b82f6' : 
                         answer.attribution === 'host' ? '#6b7280' : '#9ca3af')
                      : undefined
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    {answer.revealed ? (
                      <div className="text-center">
                        <div className="text-2xl font-bold mb-2">{answer.text}</div>
                        <div className="text-xl font-bold text-green-600">₹{answer.value}</div>
                      </div>
                    ) : (
                      <div className="text-4xl font-bold text-gray-400">{index + 1}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <h2 className="text-4xl font-bold mb-4">Waiting for Question...</h2>
            <p className="text-xl text-gray-400">The host will select a question soon</p>
          </div>
        )}
      </div>

      {/* Score Bump Animation */}
      {scoreBump && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div 
            className="text-8xl font-bold animate-bounce"
            style={{ color: scoreBump.team === 'red' ? '#ef4444' : 
                           scoreBump.team === 'green' ? '#22c55e' : '#3b82f6' }}
          >
            +₹{scoreBump.amount}
          </div>
        </div>
      )}

      {/* Scorecard Overlay */}
      {gameState?.scorecardOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-gray-800 rounded-lg p-8 max-w-2xl w-full mx-4">
            <h2 className="text-4xl font-bold text-center mb-8">FINAL SCORES</h2>
            <div className="space-y-4">
              {teams.map((team) => (
                <div key={team.id} className="flex justify-between items-center p-4 bg-gray-700 rounded">
                  <div className="flex items-center space-x-4">
                    <div 
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: team.color }}
                    ></div>
                    <span className="text-2xl font-bold">{team.name}</span>
                  </div>
                  <span className="text-3xl font-bold">₹{team.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
