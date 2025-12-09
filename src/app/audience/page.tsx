'use client';

import { useEffect, useState } from 'react';
import { gameStateManager, GameState, Team } from '@/lib/gameState';
import { useAuth } from '@/contexts/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import { MdEmail } from 'react-icons/md';

// Generate a unique device ID and store in localStorage
function getOrCreateDeviceId(): string {
  const DEVICE_ID_KEY = 'bachelor-gameshow-device-id';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate UUID-like device ID
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

export default function AudiencePage() {
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    upiId: '',
    team: '' as 'red' | 'green' | 'blue' | ''
  });
  const [emailFormData, setEmailFormData] = useState({
    email: '',
    password: ''
  });
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedTeam, setSubmittedTeam] = useState<'red' | 'green' | 'blue' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState('');
  const [isExistingVoter, setIsExistingVoter] = useState(false);
  const [existingVoterData, setExistingVoterData] = useState<{ name: string; phone: string; upiId: string } | null>(null);
  const [previousVotingState, setPreviousVotingState] = useState(false);

  useEffect(() => {
    const unsubscribeGameState = gameStateManager.subscribeToGameState((state) => {
      // Auto-refresh when voting reopens (transitions from closed to open)
      if (state.audienceWindow && !previousVotingState && submitted) {
        setSubmitted(false);
        setSubmittedTeam(null);
        setFormData({ name: '', phone: '', upiId: '', team: '' });
      }

      // Track previous voting state
      setPreviousVotingState(state.audienceWindow || false);
      setGameState(state);
    });

    const unsubscribeTeams = gameStateManager.subscribeToTeams((teamsData) => {
      setTeams(teamsData);
    });

    return () => {
      unsubscribeGameState();
      unsubscribeTeams();
    };
  }, [submitted, previousVotingState]);

  // Check if user has voted before (existing voter) and if they've voted in current round
  useEffect(() => {
    const checkExistingVoter = async () => {
      if (!user || !gameState) return;

      const deviceId = getOrCreateDeviceId();

      // Check database for existing voter data
      const audienceMembers = await gameStateManager.getAudienceMembers();
      const existingVote = audienceMembers.find(
        m => m.deviceId === deviceId || m.authUid === user.uid
      );

      if (existingVote) {
        setIsExistingVoter(true);
        setExistingVoterData({
          name: existingVote.name,
          phone: existingVote.phone,
          upiId: existingVote.upiId
        });

        // If they've already voted in the current voting round, show success screen
        if (existingVote.votingRound === gameState.votingRound) {
          setSubmitted(true);
          setSubmittedTeam(existingVote.team);
        } else {
          // Voted before but in a previous round - can vote again
          setSubmitted(false);
          setSubmittedTeam(null);
        }
      } else {
        setIsExistingVoter(false);
        setExistingVoterData(null);
        setSubmitted(false);
        setSubmittedTeam(null);
      }
    };

    checkExistingVoter();
  }, [user, gameState]);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      await signInWithGoogle();
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailFormData.email || !emailFormData.password) {
      setAuthError('Please enter email and password');
      return;
    }

    try {
      setAuthError('');
      if (isSignUp) {
        await signUpWithEmail(emailFormData.email, emailFormData.password);
      } else {
        await signInWithEmail(emailFormData.email, emailFormData.password);
      }
      setShowEmailForm(false);
      setEmailFormData({ email: '', password: '' });
    } catch (err: any) {
      setAuthError(err.message || `Failed to ${isSignUp ? 'sign up' : 'sign in'}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('Please sign in first');
      return;
    }

    // For existing voters, only team is required
    if (isExistingVoter && existingVoterData) {
      if (!formData.team) {
        setError('Please select a team');
        return;
      }
    } else {
      // For new voters, all fields required
      if (!formData.name || !formData.phone || !formData.upiId || !formData.team) {
        setError('Please fill in all fields');
        return;
      }
    }

    if (!gameState?.audienceWindow) {
      setError('Voting is currently closed');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const deviceId = getOrCreateDeviceId();

      // Determine auth provider
      let authProvider: 'google' | 'email' | 'unknown' = 'unknown';
      if (user.providerData[0]) {
        const providerId = user.providerData[0].providerId;
        if (providerId.includes('google')) authProvider = 'google';
        else if (providerId.includes('password')) authProvider = 'email';
      }

      // Use existing data for subsequent votes, or new data for first vote
      const voteData = isExistingVoter && existingVoterData ? {
        deviceId,
        name: existingVoterData.name,
        phone: existingVoterData.phone,
        upiId: existingVoterData.upiId,
        authUid: user.uid,
        authEmail: user.email,
        authProvider,
        team: formData.team
      } : {
        deviceId,
        name: formData.name,
        phone: formData.phone,
        upiId: formData.upiId,
        authUid: user.uid,
        authEmail: user.email,
        authProvider,
        team: formData.team
      };

      await gameStateManager.submitAudienceMember(voteData);

      // Immediately update dugout counts for real-time display
      await gameStateManager.updateAudienceVotingResults();

      setSubmitted(true);
      setSubmittedTeam(formData.team);
      setFormData({ name: '', phone: '', upiId: '', team: '' });
    } catch (err: any) {
      if (err.message && err.message.includes('only allowed in the first voting round')) {
        setError('New voters are only allowed in the first voting round.');
      } else {
        setError('Failed to submit. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = (team: 'red' | 'green' | 'blue') => {
    setFormData(prev => ({ ...prev, team }));
  };

  // Calculate earnable share for selected team
  const calculateEarnableShare = (teamId: 'red' | 'green' | 'blue') => {
    const team = teams.find(t => t.id === teamId);
    if (!team || team.dugoutCount === 0) return 0;
    return Math.floor(team.score / team.dugoutCount);
  };

  // Show authentication screen if not logged in
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="mb-4">
              <img
                src="/WhatsApp Image 2025-08-12 at 15.56.07_32a23c23.jpg"
                alt="Akal Ke Ghode Logo"
                className="w-24 h-24 mx-auto rounded-lg shadow-md"
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AKAL KE GHODE</h1>
            <p className="text-gray-600">Sign in to vote for your team</p>
          </div>

          {/* Episode Info */}
          {gameState?.episodeInfo && (
            <div className="bg-indigo-100 text-indigo-900 p-3 rounded-lg mb-6 text-center text-sm font-medium">
              {gameState.episodeInfo}
            </div>
          )}

          {authError && (
            <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm mb-4">
              {authError}
            </div>
          )}

          {!showEmailForm ? (
            <>
              {/* Social Login Buttons */}
              <div className="space-y-3 mb-4">
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  <FcGoogle size={24} />
                  Continue with Google
                </button>

                <button
                  onClick={() => { setShowEmailForm(true); setIsSignUp(false); }}
                  className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  <MdEmail size={24} className="text-gray-600" />
                  Continue with Email
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Email/Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={emailFormData.email}
                    onChange={(e) => setEmailFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={emailFormData.password}
                    onChange={(e) => setEmailFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                >
                  {isSignUp ? 'Sign Up' : 'Sign In'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full text-blue-600 text-sm hover:underline"
                >
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="w-full text-gray-600 text-sm hover:underline"
                >
                  Back to other options
                </button>
              </form>
            </>
          )}

          {/* Footer */}
          <div className="text-center mt-6 text-sm text-gray-500">
            <p>Secure authentication with Firebase</p>
          </div>
        </div>
      </div>
    );
  }

  // Show success screen after submission
  if (submitted && submittedTeam) {
    const teamColors = {
      red: 'bg-red-600',
      green: 'bg-green-600',
      blue: 'bg-blue-600'
    };

    return (
      <div className={`min-h-screen ${teamColors[submittedTeam]} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Thank You!</h1>
            <p className="text-gray-600 mb-6">
              Your vote has been submitted successfully for Team {submittedTeam.charAt(0).toUpperCase() + submittedTeam.slice(1)}.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Logged in as: {user.email || 'User'}
            </p>
          </div>

          {/* Team Standings */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-3 text-center">Current Standings</h2>
            <div className="space-y-2">
              {teams.map((team) => (
                <div key={team.id} className="flex justify-between items-center bg-white p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: team.color }}
                    ></div>
                    <div>
                      <div className="font-bold text-sm" style={{ color: team.color }}>{team.name}</div>
                      <div className="text-xs text-gray-500">{team.dugoutCount} votes</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">₹{team.score.toLocaleString()}</div>
                    {team.dugoutCount > 0 && (
                      <div className="text-xs text-green-600">
                        ₹{Math.floor(team.score / team.dugoutCount)}/person
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            Wait for the next voting round to vote again
          </p>
        </div>
      </div>
    );
  }

  // Main voting form
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4 flex items-center justify-center">
      <div className="bg-white p-4 max-w-md w-full rounded-lg">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/WhatsApp Image 2025-08-12 at 15.56.07_32a23c23.jpg"
              alt="Akal Ke Ghode Logo"
              className="w-16 h-16 mx-4 rounded-lg shadow-md"
            />
            <h1 className="text-3xl font-bold text-gray-900">AKAL KE GHODE</h1>
          </div>
          <p className="text-sm text-gray-500 mt-2">Signed in as: {user.email || 'User'}</p>
        </div>

        {/* Episode Info */}
        {gameState?.episodeInfo && (
          <div className="bg-indigo-100 text-indigo-900 p-3 rounded-lg mb-6 text-center text-sm font-medium">
            {gameState.episodeInfo}
          </div>
        )}

        {/* Voting Status */}
        <div className={`text-center p-3 rounded-lg mb-4 ${gameState?.audienceWindow
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800'
          }`}>
          <div className="font-bold">
            {gameState?.audienceWindow ? '🗳️ VOTING OPEN' : '❌ VOTING CLOSED'}
          </div>
          <div className="text-sm">
            {gameState?.audienceWindow
              ? 'Select your team below'
              : 'Please wait for voting to open'
            }
          </div>
        </div>

        {/* Team Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Select Your Team</h2>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'red', name: 'Red', color: '#ef4444' },
              { id: 'green', name: 'Green', color: '#22c55e' },
              { id: 'blue', name: 'Blue', color: '#3b82f6' }
            ].map((teamOption) => {
              const teamData = teams.find(t => t.id === teamOption.id);
              return (
                <button
                  key={teamOption.id}
                  onClick={() => handleTeamSelect(teamOption.id as 'red' | 'green' | 'blue')}
                  className={`p-2 rounded-lg border-2 transition-all ${formData.team === teamOption.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                    }`}
                  disabled={!gameState?.audienceWindow}
                >
                  <div>
                    {/* Left: Team name and color */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: teamOption.color }}
                      ></div>
                      <div className="text-left">
                        <div className="font-bold text-lg text-black" style={{ color: teamOption.color }}>{teamOption.name}</div>
                        <div className="text-xs text-gray-500">{teamData?.dugoutCount || 0} votes</div>
                        <div className="text-xl font-bold text-black">₹{teamData?.score.toLocaleString() || 0}</div>
                        {teamData && teamData.dugoutCount > 0 && (
                          <div className="text-xs text-green-600">
                            ₹{calculateEarnableShare(teamOption.id as 'red' | 'green' | 'blue')}/person
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Earnable Share Preview */}
          {formData.team && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
              <div className="text-sm text-yellow-900 text-center">
                <span className="font-bold">Your Potential Share: </span>
                ₹{calculateEarnableShare(formData.team).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Show full form only for new voters */}
          {!isExistingVoter && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder-gray-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder-gray-500"
                  placeholder="Enter your phone number"
                  disabled={!gameState?.audienceWindow}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UPI ID
                </label>
                <input
                  type="text"
                  value={formData.upiId}
                  onChange={(e) => setFormData(prev => ({ ...prev, upiId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder-gray-500"
                  placeholder="Enter your UPI ID (e.g., yourname@paytm)"
                  disabled={!gameState?.audienceWindow}
                  required
                />
              </div>
            </>
          )}

          {/* Show welcome message for existing voters */}
          {isExistingVoter && existingVoterData && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <p className="text-sm text-blue-900">
                <span className="font-bold">Welcome back, {existingVoterData.name}!</span>
                <br />
                <span className="text-xs">Just select your team below</span>
              </p>
            </div>
          )}

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
            className={`w-full py-3 rounded-lg font-bold transition-all ${gameState?.audienceWindow && formData.team && !loading
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

        {/* Footer 
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>3-layer duplicate prevention active</p>
          <p className="text-xs mt-1">(Device + Phone/UPI + Authentication)</p>
        </div>*/}
      </div>
    </div>
  );
}
