'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState } from '@/lib/gameState';

export default function AudiencePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    team: '' as 'red' | 'green' | 'blue' | ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Subscribe to game state to check if voting is open
    const unsubscribeGameState = gameStateManager.subscribeToGameState(setGameState);
    return () => unsubscribeGameState();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.team) {
      setError('Please fill in all fields');
      return;
    }

    if (!gameState?.audienceWindow) {
      setError('Voting is currently closed');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await gameStateManager.submitAudienceMember({
        name: formData.name,
        phone: formData.phone,
        team: formData.team
      });
      
      setSubmitted(true);
      setFormData({ name: '', phone: '', team: '' });
    } catch (error) {
      setError('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = (team: 'red' | 'green' | 'blue') => {
    setFormData(prev => ({ ...prev, team }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Thank You!</h1>
          <p className="text-gray-600 mb-6">
            Your team selection has been submitted successfully.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">BACHELOR GAME SHOW</h1>
          <p className="text-gray-600">Choose Your Team</p>
        </div>

        {/* Voting Status */}
        <div className={`text-center p-3 rounded-lg mb-6 ${
          gameState?.audienceWindow 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          <div className="font-bold">
            {gameState?.audienceWindow ? '🗳️ VOTING OPEN' : '❌ VOTING CLOSED'}
          </div>
          <div className="text-sm">
            {gameState?.audienceWindow 
              ? 'Submit your team selection below' 
              : 'Please wait for voting to open'
            }
          </div>
        </div>

        {/* Team Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Select Your Team</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'red', name: 'Red', color: '#ef4444' },
              { id: 'green', name: 'Green', color: '#22c55e' },
              { id: 'blue', name: 'Blue', color: '#3b82f6' }
            ].map((team) => (
              <button
                key={team.id}
                onClick={() => handleTeamSelect(team.id as 'red' | 'green' | 'blue')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.team === team.id
                    ? 'border-gray-900 bg-gray-100'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={!gameState?.audienceWindow}
              >
                <div 
                  className="w-8 h-8 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: team.color }}
                ></div>
                <div className="font-bold text-sm">{team.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
              disabled={!gameState?.audienceWindow}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your phone number"
              disabled={!gameState?.audienceWindow}
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!gameState?.audienceWindow || loading || !formData.team}
            className={`w-full py-3 rounded-lg font-bold transition-all ${
              gameState?.audienceWindow && formData.team && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Submitting...
              </div>
            ) : (
              'Submit Team Selection'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>One submission per phone number</p>
          <p>Voting window controlled by game host</p>
        </div>
      </div>
    </div>
  );
}
