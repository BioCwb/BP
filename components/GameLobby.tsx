import React, { useState, useEffect, useMemo, useRef } from 'react';
import { type UserData } from '../App';
import type firebase from 'firebase/compat/app';
import { db, arrayUnion, increment, serverTimestamp } from '../firebase/config';
import type { GameState } from './BingoGame';
import { generateBingoCard } from '../utils/bingoUtils';
import { useNotification } from '../context/NotificationContext';
import { CoinIcon } from './icons/CoinIcon';
import { PurchaseFichasModal } from './PurchaseFichasModal';

interface GameLobbyProps {
  user: firebase.User;
  userData: UserData;
  onPlay: () => void;
  onSpectate: () => void;
  onManageProfile: () => void;
  onLogout: () => void;
  onGoToAdmin: () => void;
}

// TODO: Substitua pelo UID do seu usuário administrador do Firebase Authentication.
const ADMIN_UID = 'fKlSv57pZeSGPGiQG2z4NKAD9qi2';

interface BingoCardData {
    id: string;
    numbers: number[];
}

interface ChatMessage {
    id: string;
    uid: string;
    displayName: string;
    text: string;
    timestamp: firebase.firestore.Timestamp;
}

interface GameHistoryItem {
    id: string;
    winners: { uid: string; displayName: string; card: number[] }[];
    drawnNumbers: number[];
    prizePool: number;
    completedAt: firebase.firestore.Timestamp;
}

export const GameLobby: React.FC<GameLobbyProps> = ({ user, userData, onPlay, onSpectate, onManageProfile, onLogout, onGoToAdmin }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myCardCount, setMyCardCount] = useState(0);
  const { showNotification } = useNotification();
  const [isBuying, setIsBuying] = useState(false);
  const [isBonusAvailable, setIsBonusAvailable] = useState(false);
  const [bonusCooldown, setBonusCooldown] = useState('');
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
  const myCardsCollectionRef = useMemo(() => db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game'), [user.uid]);
  const chatCollectionRef = useMemo(() => db.collection('chat'), []);
  const gameHistoryCollectionRef = useMemo(() => db.collection('game_history'), []);

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
    
    const unsubChat = chatCollectionRef.orderBy('timestamp', 'asc').limitToLast(100).onSnapshot(snapshot => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        setChatMessages(messages);
    });

    const unsubHistory = gameHistoryCollectionRef
        .orderBy('completedAt', 'desc')
        .limit(5)
        .onSnapshot(snapshot => {
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameHistoryItem));
            setGameHistory(history);
        });

    return () => { unsubGame(); unsubCards(); unsubChat(); unsubHistory(); };
  }, [gameDocRef, myCardsCollectionRef, chatCollectionRef, gameHistoryCollectionRef]);

  // Effect to count online players.
  useEffect(() => {
    const statusCollectionRef = db.collection('player_status');

    const countOnlinePlayers = () => {
      // A player is online if they've been seen in the last 30 seconds.
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      
      // Note: This query requires a Firestore index on 'lastSeen'.
      // Firebase will provide a link in the console error to create it automatically if it's missing.
      statusCollectionRef.where('lastSeen', '>', thirtySecondsAgo).get()
        .then(snapshot => {
          setOnlinePlayersCount(snapshot.size);
        })
        .catch(err => {
          console.error("Error getting online player count: ", err);
        });
    };

    // Initial count when component mounts
    countOnlinePlayers();

    // Set up an interval to periodically refresh the count
    const intervalId = setInterval(countOnlinePlayers, 10000); // Refresh every 10 seconds

    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    try {
        await chatCollectionRef.add({
            uid: user.uid,
            displayName: userData.displayName,
            text: newMessage,
            timestamp: serverTimestamp()
        });
        setNewMessage('');
    } catch (error) {
        console.error("Error sending message:", error);
        showNotification("Não foi possível enviar a mensagem.", 'error');
    }
  };
  
  const handleBuyCard = async () => {
    setIsBuying(true);

    // Client-side validation
    if (myCardCount >= 10) {
        showNotification('Você não pode ter mais de 10 cartelas.', 'error');
        setIsBuying(false);
        return;
    }
    if (userData.fichas < 10) {
        showNotification('Fichas (F) insuficientes para comprar uma cartela.', 'error');
        setIsBuying(false);
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
            const userDocRef = db.collection("users").doc(user.uid);
            const playerCardsDocRef = db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game');
            const purchaseHistoryRef = db.collection('purchase_history').doc();

            // Fetch all necessary documents within the transaction
            const userDoc = await transaction.get(userDocRef);
            const gameDoc = await transaction.get(gameDocRef);
            const playerCardsDoc = await transaction.get(playerCardsDocRef);

            // Validate documents exist
            if (!userDoc.exists || !gameDoc.exists) {
                throw new Error('Dados do usuário ou do jogo não encontrados. Por favor, tente novamente.');
            }

            // Server-side validation for security and data integrity
            if (userDoc.data()!.fichas < 10) {
                throw new Error('Fichas (F) insuficientes para comprar uma cartela.');
            }
            const currentCards = playerCardsDoc.exists ? playerCardsDoc.data()!.cards || [] : [];
            if (currentCards.length >= 10) {
                throw new Error('Você não pode ter mais de 10 cartelas.');
            }

            // Prepare new card data
            const newCardData: BingoCardData = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                numbers: generateBingoCard()
            };
            const gameData = gameDoc.data() as GameState;

            // Prepare updated player list for the game state
            const newPlayers = gameData.players ? { ...gameData.players } : {};
            const player = newPlayers[user.uid];
            newPlayers[user.uid] = {
                displayName: user.displayName || 'Player',
                cardCount: (player?.cardCount || 0) + 1,
                progress: player?.progress ?? 24, // Default progress for blackout bingo is 24
            };

            // Queue up all transaction writes
            transaction.update(userDocRef, {
                fichas: increment(-10),
                cardsPurchased: increment(1)
            });

            transaction.update(gameDocRef, {
                prizePool: increment(9), // 9 F goes to prize pool, 1 F is house cut
                players: newPlayers,
            });

            if (playerCardsDoc.exists) {
                transaction.update(playerCardsDocRef, { cards: arrayUnion(newCardData) });
            } else {
                transaction.set(playerCardsDocRef, { cards: [newCardData] });
            }

            // Create an audit log for the purchase
            transaction.set(purchaseHistoryRef, {
                playerId: user.uid,
                playerName: user.displayName || 'Player',
                cardId: newCardData.id,
                cardNumbers: newCardData.numbers,
                timestamp: serverTimestamp(),
                roundId: gameData.roundId, // Associate purchase with the current round
            });
        });
    } catch (e: any) {
        console.error("Buy card transaction failed:", e);
        if (e.message.includes('10 cartelas')) {
            showNotification('Você não pode ter mais de 10 cartelas.', 'error');
        } else if (e.message.includes('insuficientes')) {
            showNotification('Fichas (F) insuficientes para comprar uma cartela.', 'error');
        } else {
            showNotification(e.message, 'error');
        }
    } finally {
        setIsBuying(false);
    }
};


  const handleDailyBonus = async () => {
    if (!isBonusAvailable || isClaimingBonus) return;
    
    setIsClaimingBonus(true);
    
    try {
        const userDocRef = db.collection("users").doc(user.uid);
        await userDocRef.update({
            fichas: increment(10),
            lastBonusClaimedAt: serverTimestamp()
        });
    } catch (e: any) {
        console.error("Daily bonus claim failed:", e);
        showNotification("Falha ao resgatar o bônus. Tente novamente.", 'error');
    } finally {
        setIsClaimingBonus(false);
    }
  };

  const canBuyCard = gameState?.status === 'waiting' && !isBuying;

  return (
    <div className="bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-xl shadow-2xl p-6 md:p-8 w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Coluna da Esquerda: Controles do Jogo */}
        <div className="flex flex-col">
            <div className="text-center">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold text-white">Bem-vindo, {userData.displayName}!</h2>
                    <p className="text-2xl font-bold text-yellow-400 mt-2">Saldo: {typeof userData.fichas === 'number' ? userData.fichas : '...'} F</p>
                    <p className="text-lg text-green-400 mt-1">Jogadores Online: {onlinePlayersCount}</p>
                    <p className="text-lg text-gray-300 mt-1">Você tem {myCardCount} cartela(s).</p>
                </div>
                
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
                        onClick={() => setIsPurchaseModalOpen(true)}
                        className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-50 flex items-center justify-center gap-2"
                     >
                        <CoinIcon className="w-5 h-5" />
                        Comprar Fichas (PIX)
                    </button>
                    <button
                        onClick={onSpectate}
                        className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-50"
                    >
                        Assistir como Espectador
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

            <div className="mt-6 flex-grow flex flex-col min-h-0">
                <h3 className="text-xl font-bold text-center text-white mb-4 border-t border-gray-700 pt-4 flex-shrink-0">Histórico de Partidas</h3>
                {gameHistory.length > 0 ? (
                    <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                        {gameHistory.map(game => (
                            <div key={game.id} className="bg-gray-900 bg-opacity-50 rounded-lg p-3">
                                <button
                                    onClick={() => setExpandedHistoryId(expandedHistoryId === game.id ? null : game.id)}
                                    className="w-full text-left focus:outline-none"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-grow">
                                            <p className="font-semibold text-purple-300">
                                                Vencedor(es): {game.winners.length > 0 ? game.winners.map(w => w.displayName).join(', ') : 'Nenhum'}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {game.completedAt ? new Date(game.completedAt.toDate()).toLocaleString('pt-BR') : 'Data indisponível'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-2">
                                            <p className="text-sm font-bold text-yellow-400">Prêmio: {game.prizePool} F</p>
                                            <span className={`transform transition-transform text-purple-300 inline-block mt-1 ${expandedHistoryId === game.id ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                                        </div>
                                    </div>
                                </button>
                                {expandedHistoryId === game.id && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 space-y-3">
                                        {game.winners.map((winner, index) => (
                                            <div key={index}>
                                                <p className="text-sm font-semibold mb-1 text-center">Cartela Vencedora de {winner.displayName}:</p>
                                                <div className="grid grid-cols-5 gap-1 p-1 bg-gray-800 rounded-md max-w-[200px] mx-auto">
                                                    {winner.card.map((num, i) => (
                                                        <div key={i} className={`flex items-center justify-center aspect-square rounded-sm text-xs font-bold ${
                                                            num === 0 ? 'bg-yellow-500 text-black' : 'bg-purple-600 text-white'
                                                        }`}>
                                                            {num === 0 ? '★' : num}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-center italic mt-4 flex-grow">Nenhuma partida recente encontrada.</p>
                )}
            </div>
        </div>

        {/* Coluna da Direita: Chat */}
        <div className="flex flex-col bg-gray-900 bg-opacity-50 rounded-lg p-4 h-[60vh] md:h-auto">
            <h3 className="text-xl font-bold text-center text-white mb-4 border-b border-gray-700 pb-2">Chat do Lobby</h3>
            <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                {chatMessages.map(msg => (
                     <div key={msg.id} className={`flex gap-2 items-start w-full ${msg.uid === user.uid ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`p-3 rounded-lg max-w-xs ${msg.uid === user.uid ? 'bg-purple-700' : 'bg-gray-700'}`}>
                            <p className={`text-xs font-bold mb-1 ${msg.uid === user.uid ? 'text-right text-purple-200' : 'text-left text-blue-300'}`}>{msg.displayName}</p>
                            <p className="text-white text-sm break-words">{msg.text}</p>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-grow py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button type="submit" className="py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold">Enviar</button>
            </form>
        </div>
        <PurchaseFichasModal isOpen={isPurchaseModalOpen} onClose={() => setIsPurchaseModalOpen(false)} />
    </div>
  );
};