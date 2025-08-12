'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';

export default function DisplayPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scoreBump] = useState<{ team: string; amount: number } | null>(null);

  useEffect(() => {
    console.log('Display page: Initializing...');
    
    // Initialize game
    gameStateManager.initializeGame().then(() => {
      console.log('Display page: Game initialized');
    }).catch((error) => {
      console.error('Display page: Error initializing game:', error);
    });

    // Subscribe to real-time updates
    const unsubscribeGameState = gameStateManager.subscribeToGameState((state) => {
      console.log('Display page: Game state updated:', state);
      setGameState(state);
    });
    
    const unsubscribeTeams = gameStateManager.subscribeToTeams((teamsData) => {
      console.log('Display page: Teams updated:', teamsData);
      setTeams(teamsData);
    });
    
    const unsubscribeQuestion = gameStateManager.subscribeToCurrentQuestion((question) => {
      console.log('Display page: Question updated:', question);
      setCurrentQuestion(question);
    });

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
      unsubscribeQuestion();
    };
  }, []);

  console.log('Display page: Current state:', { gameState, teams, currentQuestion });

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
      {/* Debug Info */}
      <div className="bg-red-900 p-2 text-xs">
        Debug: GameState={JSON.stringify(gameState)}, Teams={teams.length}, Question={currentQuestion?.id || 'none'}
      </div>
      
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
                         answer.attribution === 'host' ? '#6b7280' : '#6b7280')
                      : '#4b5563'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    {answer.revealed ? (
                      <div className="text-center">
                        <div className="text-2xl font-bold">{answer.text}</div>
                        <div className="text-lg font-semibold">₹{answer.value.toLocaleString()}</div>
                      </div>
                    ) : (
                      <div className="text-4xl font-bold text-gray-400">?</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="text-4xl font-bold mb-4">No Question Selected</h2>
            <p className="text-xl text-gray-400">Please select a question from the control panel</p>
          </div>
        )}
      </div>

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

      {/* Score Bump Animation */}
      {scoreBump && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="text-6xl font-bold text-green-400 animate-bounce">
            +₹{scoreBump.amount.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
