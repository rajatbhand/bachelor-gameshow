'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState, Team, Question } from '@/lib/gameState';
import { bachelorQuestions, loadQuestionsToFirebase } from '../../lib/questions';

export default function ControlPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleUpdateGameState = async (updates: Partial<GameState>) => {
    setLoading(true);
    try {
      await gameStateManager.updateGameState(updates);
    } catch (error) {
      console.error('Error updating game state:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealAnswer = async (answerId: string, attribution: 'red' | 'green' | 'blue' | 'host' | 'neutral') => {
    if (!currentQuestion) return;
    
    setLoading(true);
    try {
      await gameStateManager.revealAnswer(currentQuestion.id, answerId, attribution);
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
      await gameStateManager.resetGame();
    } catch (error) {
      console.error('Error resetting game:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadQuestions = async () => {
    setLoading(true);
    try {
      await loadQuestionsToFirebase();
      alert('Questions loaded successfully!');
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Error loading questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (questionId: string) => {
    setLoading(true);
    try {
      await gameStateManager.updateGameState({ currentQuestion: questionId });
    } catch (error) {
      console.error('Error selecting question:', error);
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-sm text-gray-600">Current Round</div>
              <div className="text-xl font-bold">{gameState?.currentRound?.toUpperCase() || 'PRE-SHOW'}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600">Active Team</div>
              <div className="text-xl font-bold">{gameState?.activeTeam?.toUpperCase() || 'NONE'}</div>
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

          {/* Team Scores */}
          <div className="grid grid-cols-3 gap-4">
            {teams.map((team) => (
              <div key={team.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold" style={{ color: team.color }}>{team.name}</h3>
                  <span className="text-sm text-gray-600">Dugout: {team.dugoutCount}</span>
                </div>
                <div className="text-2xl font-bold mb-2">₹{team.score.toLocaleString()}</div>
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

        {/* Game Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Game Controls */}
          <div className="space-y-6">
            {/* Round Selection */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Round Control</h2>
              <div className="grid grid-cols-3 gap-2">
                {(['pre-show', 'round1', 'round2', 'round3', 'final'] as const).map((round) => (
                  <button
                    key={round}
                    onClick={() => handleUpdateGameState({ currentRound: round })}
                    className={`p-3 rounded-lg font-bold ${
                      gameState?.currentRound === round
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    disabled={loading}
                  >
                    {round.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Team Selection */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Active Team</h2>
              <div className="grid grid-cols-2 gap-2">
                {(['red', 'green', 'blue', 'host'] as const).map((team) => (
                  <button
                    key={team}
                    onClick={() => handleUpdateGameState({ activeTeam: team })}
                    className={`p-3 rounded-lg font-bold ${
                      gameState?.activeTeam === team
                        ? 'bg-yellow-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    disabled={loading}
                  >
                    {team.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Overlay Controls */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Overlays</h2>
              <div className="space-y-3">
                <button
                  onClick={() => handleUpdateGameState({ bigX: !gameState?.bigX })}
                  className={`w-full p-3 rounded-lg font-bold ${
                    gameState?.bigX ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                  disabled={loading}
                >
                  {gameState?.bigX ? 'HIDE BIG X' : 'SHOW BIG X'}
                </button>
                <button
                  onClick={() => handleUpdateGameState({ scorecardOverlay: !gameState?.scorecardOverlay })}
                  className={`w-full p-3 rounded-lg font-bold ${
                    gameState?.scorecardOverlay ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                  disabled={loading}
                >
                  {gameState?.scorecardOverlay ? 'HIDE SCORECARD' : 'SHOW SCORECARD'}
                </button>
                <button
                  onClick={() => handleUpdateGameState({ logoOnly: !gameState?.logoOnly })}
                  className={`w-full p-3 rounded-lg font-bold ${
                    gameState?.logoOnly ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                  disabled={loading}
                >
                  {gameState?.logoOnly ? 'HIDE LOGO' : 'SHOW LOGO'}
                </button>
              </div>
            </div>

            {/* Audience Control */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Audience Voting</h2>
              <button
                onClick={() => handleUpdateGameState({ audienceWindow: !gameState?.audienceWindow })}
                className={`w-full p-3 rounded-lg font-bold ${
                  gameState?.audienceWindow ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
                disabled={loading}
              >
                {gameState?.audienceWindow ? 'CLOSE VOTING' : 'OPEN VOTING'}
              </button>
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

            {/* Load Questions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Load Questions</h2>
              <button
                onClick={handleLoadQuestions}
                className="w-full p-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 mb-3"
                disabled={loading}
              >
                LOAD BACHELOR QUESTIONS
              </button>
              
              <div className="space-y-2">
                {bachelorQuestions.map((question) => (
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
                ))}
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

          {/* Right Column - Question and Answers */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Current Question</h2>
            
            {currentQuestion ? (
              <div>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-bold text-lg mb-2">{currentQuestion.text}</h3>
                </div>

                <div className="space-y-3">
                  {currentQuestion.answers.slice(0, currentQuestion.answerCount).map((answer, index) => (
                    <div key={answer.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold">#{index + 1}</span>
                        <span className="text-sm text-gray-600">₹{answer.value}</span>
                      </div>
                      
                      {answer.revealed ? (
                        <div className="space-y-2">
                          <div className="font-bold text-lg">{answer.text}</div>
                          <div className="text-sm text-gray-600">
                            Revealed by: {answer.attribution?.toUpperCase() || 'UNKNOWN'}
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
                          <div className="text-gray-500">Hidden</div>
                          <div className="flex flex-wrap gap-1">
                            {(['red', 'green', 'blue', 'host', 'neutral'] as const).map((attribution) => (
                              <button
                                key={attribution}
                                onClick={() => handleRevealAnswer(answer.id, attribution)}
                                className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                                disabled={loading}
                              >
                                {attribution.toUpperCase()}
                              </button>
                            ))}
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
