import React, { useState, useEffect, useMemo } from 'react';
import { type UserData } from '../App';
import type firebase from 'firebase/compat/app';
import { db, arrayUnion, increment, serverTimestamp } from '../firebase/config';
import type { GameState } from './BingoGame';
import { generateBingoCard } from '../utils/bingoUtils';

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

interface BingoCardData {
    numbers: number[];
}

export const GameLobby: React.FC<GameLobbyProps> = ({ user, userData, onPlay, onManageProfile, onLogout, onGoToAdmin }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myCardCount, setMyCardCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isBonusAvailable, setIsBonusAvailable] = useState(false);
  const [bonusCooldown, setBonusCooldown] = useState('');
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);

  const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
  const myCardsCollectionRef = useMemo(() => db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game'), [user.uid]);

  useEffect(() => {
    const unsubGame = gameDocRef.onSnapshot((doc) => {
        if (doc.exists) {
            setGameState(doc.data() as GameState);
        } else {
            setGameState(null);
        }
    });

    const unsubCards = myCardsCollectionRef.onSnapshot((doc) => {
        if (doc.exists) {
            setMyCardCount(doc.data()!.cards?.length || 0);
        } else {
            setMyCardCount(0);
        }
    });

    return () => { unsubGame(); unsubCards(); };
  }, [gameDocRef, myCardsCollectionRef]);
  
  // Effect to check and update the daily bonus availability and cooldown timer.
  useEffect(() => {
    const timer = setInterval(() => {
        const lastClaim = userData.lastBonusClaimedAt?.toDate();
        if (!lastClaim) {
            setIsBonusAvailable(true);
            setBonusCooldown('');
            return;
        }

        const now = new Date();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const nextClaimTime = lastClaim.getTime() + twentyFourHours;

        if (now.getTime() >= nextClaimTime) {
            setIsBonusAvailable(true);
            setBonusCooldown('');
        } else {
            setIsBonusAvailable(false);
            const remainingMs = nextClaimTime - now.getTime();
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
            setBonusCooldown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        }
    }, 1000);

    return () => clearInterval(timer);
  }, [userData.lastBonusClaimedAt]);
  
  const handleBuyCard = async () => {
    setError(null);
    setIsBuying(true);
    if (myCardCount >= 50) { 
        setError('Você não pode ter mais de 50 cartelas.');
        setIsBuying(false);
        return;
    }
    if (userData.fichas < 10) { 
        setError('Fichas (F) insuficientes para comprar uma cartela.');
        setIsBuying(false);
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
            const userDocRef = db.collection("users").doc(user.uid);
            const userDoc = await transaction.get(userDocRef);
            const gameDoc = await transaction.get(gameDocRef);
            const playerCardsDoc = await transaction.get(myCardsCollectionRef);

            if (!userDoc.exists || !gameDoc.exists) throw new Error('Dados do usuário ou do jogo não encontrados. Por favor, tente novamente.');
            
            const currentFichas = userDoc.data()!.fichas;
            if (currentFichas < 10) throw new Error('Fichas (F) insuficientes para comprar uma cartela.');

            const newCardData: BingoCardData = { numbers: generateBingoCard() };
            const gameData = gameDoc.data() as GameState;
            const player = gameData.players?.[user.uid];

            transaction.update(userDocRef, { fichas: increment(-10) });

            transaction.update(gameDocRef, {
                prizePool: increment(9),
                [`players.${user.uid}`]: {
                    displayName: user.displayName || 'Player',
                    cardCount: (player?.cardCount || 0) + 1,
                    progress: player?.progress ?? 5,
                }
            });
            
            if (playerCardsDoc.exists) {
                transaction.update(myCardsCollectionRef, { cards: arrayUnion(newCardData) });
            } else {
                transaction.set(myCardsCollectionRef, { cards: [newCardData] });
            }
        });
    } catch (e: any) {
        console.error("Buy card transaction failed:", e);
        setError(e.message);
    } finally {
        setIsBuying(false);
    }
  };

  const handleDailyBonus = async () => {
    if (!isBonusAvailable || isClaimingBonus) return;
    
    setIsClaimingBonus(true);
    setError(null);
    
    try {
        const userDocRef = db.collection("users").doc(user.uid);
        await userDocRef.update({
            fichas: increment(10),
            lastBonusClaimedAt: serverTimestamp()
        });
    } catch (e: any) {
        console.error("Daily bonus claim failed:", e);
        setError("Falha ao resgatar o bônus. Tente novamente.");
    } finally {
        setIsClaimingBonus(false);
    }
  };

  const canBuyCard = gameState?.status === 'waiting' && !isBuying;

  return (
    <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center w-full max-w-md">
        <div className="mb-6">
            <h2 className="text-3xl font-bold text-white">Bem-vindo, {userData.displayName}!</h2>
            <p className="text-2xl font-bold text-yellow-400 mt-2">Saldo: {typeof userData.fichas === 'number' ? userData.fichas : '...'} F</p>
            <p className="text-lg text-gray-300 mt-1">Você tem {myCardCount} cartela(s).</p>
        </div>
        
        {error && <p className="text-red-400 bg-red-900 bg-opacity-50 p-3 rounded-lg mb-4">{error}</p>}
        
        <div className="space-y-4">
             <button
                onClick={onPlay}
                className="w-full py-4 px-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
             >
                JOGAR BINGO
            </button>
             <button
                onClick={handleBuyCard}
                disabled={!canBuyCard}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed"
             >
                {isBuying ? 'Comprando...' : 'Comprar Cartela (10 F)'}
            </button>
             <button
                onClick={handleDailyBonus}
                disabled={!isBonusAvailable || isClaimingBonus}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed"
             >
                {isClaimingBonus ? 'Resgatando...' : (isBonusAvailable ? 'Resgatar Bônus Diário (10 F)' : `Próximo bônus em ${bonusCooldown}`)}
            </button>
             <button
                onClick={onManageProfile}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
             >
                Gerenciar Perfil
            </button>
            
            {user.uid === ADMIN_UID && (
              <button
                onClick={onGoToAdmin}
                className="w-full py-3 px-4 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50"
              >
                Painel do Admin
              </button>
            )}

            <button
                onClick={onLogout}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
                Sair
            </button>
        </div>
    </div>
  );
};