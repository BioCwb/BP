import React from 'react';
import { type UserData } from '../App';
import type firebase from 'firebase/compat/app';

interface GameLobbyProps {
  user: firebase.User;
  userData: UserData;
  onPlay: () => void;
  onManageProfile: () => void;
  onLogout: () => void;
  onGoToAdmin: () => void;
}

// TODO: Substitua pelo UID do seu usuário administrador do Firebase Authentication.
const ADMIN_UID = 'fKlSv57pZeSGPGiQG2z4NKAD9qi2';

export const GameLobby: React.FC<GameLobbyProps> = ({ user, userData, onPlay, onManageProfile, onLogout, onGoToAdmin }) => {

  const handleComingSoon = () => {
    alert('Esta funcionalidade chegará em breve!');
  }

  return (
    <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center w-full max-w-md">
        <div className="mb-6">
            <h2 className="text-3xl font-bold text-white">Bem-vindo, {userData.displayName}!</h2>
            <p className="text-2xl font-bold text-yellow-400 mt-2">Saldo: {typeof userData.fichas === 'number' ? userData.fichas : '...'} F</p>
        </div>
        
        <div className="space-y-4">
             <button
                onClick={onPlay}
                className="w-full py-4 px-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
             >
                JOGAR BINGO
            </button>
             <button
                onClick={handleComingSoon}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
             >
                Resgatar Bônus Diário (10 F)
            </button>
            <button
                onClick={handleComingSoon}
                className="w-full py-3 px-4 bg-teal-500 hover:bg-teal-600 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-50"
             >
                Assistir Anúncio por Fichas (5 F)
            </button>
             <button
                onClick={onManageProfile}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
             >
                Gerenciar Perfil
            </button>
            
            {user.uid === ADMIN_UID && (
              <button
                onClick={onGoToAdmin}
                className="w-full py-3 px-4 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50"
              >
                Painel do Admin
              </button>
            )}

            <button
                onClick={onLogout}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
                Sair
            </button>
        </div>
    </div>
  );
};