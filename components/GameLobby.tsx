import React from 'react';
import { type UserData } from '../App';

interface GameLobbyProps {
  userData: UserData;
  onPlay: () => void;
  onManageProfile: () => void;
  onLogout: () => void;
}

export const GameLobby: React.FC<GameLobbyProps> = ({ userData, onPlay, onManageProfile, onLogout }) => {

  const handleComingSoon = () => {
    alert("This feature is coming soon!");
  }

  return (
    <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center w-full max-w-md">
        <div className="mb-6">
            <h2 className="text-3xl font-bold text-white">Welcome, {userData.displayName}!</h2>
            <p className="text-2xl font-bold text-yellow-400 mt-2">Balance: {typeof userData.fichas === 'number' ? userData.fichas : '...'} F</p>
        </div>
        
        <div className="space-y-4">
             <button
                onClick={onPlay}
                className="w-full py-4 px-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
             >
                PLAY BINGO
            </button>
             <button
                onClick={handleComingSoon}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
             >
                Claim Daily Bonus (10 F)
            </button>
            <button
                onClick={handleComingSoon}
                className="w-full py-3 px-4 bg-teal-500 hover:bg-teal-600 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-50"
             >
                Watch Ad for Fichas (5 F)
            </button>
             <button
                onClick={onManageProfile}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
             >
                Manage Profile
            </button>
            <button
                onClick={onLogout}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
                Logout
            </button>
        </div>
    </div>
  );
};