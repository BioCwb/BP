import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import firebase from 'firebase/compat/app';
import { type UserData } from '../App';
import { db, increment, serverTimestamp } from '../firebase/config';
// FIX: Removed unused v9 firestore imports to align with the v8 compatibility syntax.
import { BingoCard } from './BingoCard';
import { calculateCardProgress } from '../utils/bingoUtils';
import { BingoMasterBoard } from './BingoMasterBoard';


export interface GameState {
    status: 'waiting' | 'running' | 'ended' | 'paused';
    drawnNumbers: number[];
    players: { [uid: string]: { displayName: string; cardCount: number; progress?: number; } };
    prizePool: number;
    winners: { uid: string, displayName: string, card: number[] }[];
    host: string | null;
    countdown: number;
    lastWinnerAnnouncement: string;
    pauseReason?: string;
    // New fields for admin control
    lobbyCountdownDuration: number;
    drawIntervalDuration: number;
    endGameDelayDuration: number;
}

interface BingoCardData {
    id: string;
    numbers: number[];
}

interface BingoGameProps {
  user: firebase.User;
  userData: UserData;
  onBackToLobby: () => void;
  onSessionReset: () => void; // For critical error recovery
  isSpectator?: boolean;
}

const getBingoLetter = (num: number) => {
    if (num <= 12) return 'B';
    if (num <= 24) return 'I';
    if (num <= 36) return 'N';
    if (num <= 48) return 'G';
    if (num <= 60) return 'O';
    return '';
};


export const BingoGame: React.FC<BingoGameProps> = ({ user, userData, onBackToLobby, onSessionReset, isSpectator = false }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myCards, setMyCards] = useState<BingoCardData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [endGameCountdown, setEndGameCountdown] = useState(10);
    const [playerStatuses, setPlayerStatuses] = useState<{ [uid: string]: 'online' | 'offline' }>({});
    const [allPlayerCards, setAllPlayerCards] = useState<{[uid: string]: {displayName: string, cards: BingoCardData[]}}>({});
    const lastSeenTimestampsRef = useRef<{ [uid: string]: number }>({});


    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
    const myCardsCollectionRef = useMemo(() => db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game'), [user.uid]);

    useEffect(() => {
        let isMounted = true;
        const unsubGame = gameDocRef.onSnapshot((doc) => {
            if (!isMounted) return;
            if (doc.exists) {
                const newState = doc.data() as GameState;
                setGameState(newState);
            } else {
                 setError('O jogo ativo não foi encontrado. Redirecionando para o lobby.');
                 setTimeout(() => onBackToLobby(), 3000);
            }
        }, (err) => {
            if (!isMounted) return;
            console.error("Error fetching game state:", err);
            setError('Falha ao conectar-se ao jogo. Verifique sua conexão.');
        });
        
        let unsubCards: (() => void) | null = null;
        if (!isSpectator) {
            unsubCards = myCardsCollectionRef.onSnapshot((doc) => {
                if (!isMounted) return;
                setMyCards(doc.exists ? (doc.data()!.cards || []) : []);
            }, (err) => {
                if (!isMounted) return;
                console.error("Error fetching player cards:", err);
                setError('Falha ao carregar suas cartelas. Verifique sua conexão.');
            });
        }

        return () => { 
            isMounted = false;
            unsubGame();
            if (unsubCards) unsubCards();
        };
    }, [user, gameDocRef, myCardsCollectionRef, isSpectator, onBackToLobby]);

    // Fetch all player cards for spectator mode
    useEffect(() => {
        if (!isSpectator || !gameState) return;

        const playerIds = Object.keys(gameState.players);
        const unsubscribers = playerIds.map(uid => {
            const ref = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
            return ref.onSnapshot(doc => {
                const cards = doc.exists ? doc.data()!.cards || [] : [];
                setAllPlayerCards(prev => ({
                    ...prev,
                    [uid]: {
                        displayName: gameState.players[uid]?.displayName || 'Jogador',
                        cards: cards
                    }
                }));
            });
        });
        
        return () => unsubscribers.forEach(unsub => unsub());
    }, [isSpectator, gameState]);
    
    // Player status (presence) listener
    useEffect(() => {
        if (!gameState || !gameState.players || Object.keys(gameState.players).length === 0) {
            setPlayerStatuses({});
            return;
        };

        const playerIds = Object.keys(gameState.players);
        const statusRef = db.collection('player_status');

        const calculateAndUpdateStatuses = () => {
            const now = Date.now();
            const currentStatuses: { [uid: string]: 'online' | 'offline' } = {};
            playerIds.forEach(id => {
                const lastSeen = lastSeenTimestampsRef.current[id];
                currentStatuses[id] = (lastSeen && (now - lastSeen < 30000)) ? 'online' : 'offline';
            });
            setPlayerStatuses(currentStatuses);
        };

        const unsub = statusRef
            .where(firebase.firestore.FieldPath.documentId(), 'in', playerIds)
            .onSnapshot((snapshot) => {
                snapshot.forEach(doc => {
                    const lastSeen = doc.data().lastSeen?.toMillis();
                    if (lastSeen) {
                       lastSeenTimestampsRef.current[doc.id] = lastSeen;
                    }
                });
                // After getting fresh data from Firestore, recalculate all statuses
                calculateAndUpdateStatuses();
            });

        // Periodically check statuses to catch timeouts
        const interval = setInterval(calculateAndUpdateStatuses, 10000);

        return () => {
            unsub();
            clearInterval(interval);
        };
    }, [gameState?.players]);
    
    // Auto-resets the game after the end-game countdown finishes. Only run by the host.
    const autoResetGame = useCallback(async () => {
        if (!gameState) return;

        try {
            const announcement = gameState.winners.length ? `Último(s) vencedor(es): ${gameState.winners.map(w => w.displayName).join(', ')}` : "Jogo resetado automaticamente.";
            const batch = db.batch();

            // 1. Save game to history
            const historyRef = db.collection('game_history').doc();
            batch.set(historyRef, {
                winners: gameState.winners,
                drawnNumbers: gameState.drawnNumbers,
                prizePool: gameState.prizePool,
                completedAt: serverTimestamp()
            });
            
            // 2. Delete all active cards from participating players
            const playerIds = Object.keys(gameState.players || {});
            for (const uid of playerIds) {
                const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                batch.delete(playerCardsRef);
            }

            // 3. Reset the main game state document
            batch.update(gameDocRef, { 
                status: 'waiting', 
                drawnNumbers: [], 
                prizePool: 0, 
                winners: [], 
                countdown: gameState.lobbyCountdownDuration || 15,
                lastWinnerAnnouncement: announcement,
                players: {},
                pauseReason: ''
            });

            // 4. Clear the purchase history
            const purchaseHistoryCollectionRef = db.collection('purchase_history');
            const purchaseHistorySnapshot = await purchaseHistoryCollectionRef.get();
            purchaseHistorySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
        } catch (error) {
            console.error("Error during game auto-reset:", error);
        }
    }, [gameState, gameDocRef]);
    
    // Countdown timer for the end-of-game screen
    useEffect(() => {
        if (gameState?.status === 'ended') {
            const duration = gameState.endGameDelayDuration || 10;
            setEndGameCountdown(duration);
            const timer = setInterval(() => {
                setEndGameCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        if (user.uid === gameState.host) {
                            autoResetGame();
                        }
                        onBackToLobby();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState?.status, gameState?.endGameDelayDuration, gameState?.host, user.uid, onBackToLobby, autoResetGame]);
    
    // Game loop logic - only runs for the host. This combines number drawing and winner checking into one transaction.
    useEffect(() => {
        if (!gameState || gameState.host !== user.uid || gameState.status !== 'running') {
            return;
        }
    
        const intervalId = window.setInterval(async () => {
            try {
                await db.runTransaction(async (transaction) => {
                    const gameDoc = await transaction.get(gameDocRef);
                    if (!gameDoc.exists) return;
    
                    const data = gameDoc.data() as GameState;
                    if (data.status !== 'running') return;
    
                    const currentCountdown = data.countdown;
    
                    if (currentCountdown > 1) {
                        // Just decrement countdown, no need for complex logic
                        transaction.update(gameDocRef, { countdown: currentCountdown - 1 });
                        return;
                    }
    
                    // Time to draw a number and check for winners
                    const drawn = data.drawnNumbers;
                    if (drawn.length >= 60) {
                        transaction.update(gameDocRef, { status: 'ended' });
                        return;
                    }
    
                    let newNumber;
                    do {
                        newNumber = Math.floor(Math.random() * 60) + 1;
                    } while (drawn.includes(newNumber));
    
                    const updatedDrawnNumbers = [...drawn, newNumber];
    
                    // --- Integrated Winner Check Logic ---
                    const playerIds = Object.keys(data.players);
                    const currentWinners: { uid: string; displayName: string; card: number[] }[] = [];
                    const playerProgressUpdates: { [key: string]: any } = {};
    
                    if (updatedDrawnNumbers.length >= 24) {
                        for (const uid of playerIds) {
                            const playerData = data.players[uid];
                            if (!playerData) continue;
    
                            const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                            const playerCardsDoc = await transaction.get(playerCardsRef);
    
                            if (!playerCardsDoc.exists) continue;
    
                            const cards = playerCardsDoc.data()!.cards as BingoCardData[];
                            let minNumbersToWin = 24;
    
                            for (const cardData of cards) {
                                const progress = calculateCardProgress(cardData.numbers, updatedDrawnNumbers);
                                minNumbersToWin = Math.min(minNumbersToWin, progress.numbersToWin);
    
                                if (progress.isBingo) {
                                    if (!currentWinners.some(w => w.uid === uid)) {
                                        currentWinners.push({ uid, displayName: playerData.displayName, card: cardData.numbers });
                                    }
                                }
                            }
                            playerProgressUpdates[`players.${uid}.progress`] = minNumbersToWin;
                        }
                    }
    
                    if (currentWinners.length > 0) {
                        // We have a winner! End the game.
                        const prizePerWinner = data.prizePool > 0 ? Math.floor(data.prizePool / currentWinners.length) : 0;
    
                        transaction.update(gameDocRef, {
                            status: 'ended',
                            winners: currentWinners,
                            drawnNumbers: updatedDrawnNumbers,
                            ...playerProgressUpdates,
                        });
    
                        for (const winner of currentWinners) {
                            const userDocRef = db.collection('users').doc(winner.uid);
                            transaction.update(userDocRef, { fichas: increment(prizePerWinner) });
                        }
                    } else {
                        // No winner yet, continue the game.
                        transaction.update(gameDocRef, {
                            drawnNumbers: updatedDrawnNumbers,
                            countdown: data.drawIntervalDuration || 5,
                            ...playerProgressUpdates,
                        });
                    }
                });
            } catch (error) {
                console.error("Erro na transação principal do jogo:", error);
            }
        }, 1000);
    
        return () => {
            clearInterval(intervalId);
        };
    }, [gameState, user.uid, gameDocRef]);
    

    const sortedPlayers = useMemo(() => {
        if (!gameState || !gameState.players) return [];
        return (Object.entries(gameState.players) as [string, { displayName: string, cardCount: number, progress?: number }][])
            .sort(([, a], [, b]) => {
                const progressA = a.progress ?? 99;
                const progressB = b.progress ?? 99;
                if (progressA !== progressB) {
                    return progressA - progressB;
                }
                const cardCountA = typeof a.cardCount === 'number' ? a.cardCount : 0;
                const cardCountB = typeof b.cardCount === 'number' ? b.cardCount : 0;
                return cardCountB - cardCountA;
            });
    }, [gameState]);
    
    if (error) {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center text-center p-4">
                <h2 className="text-3xl font-bold text-red-400 mb-4">Ocorreu um Erro</h2>
                <p className="text-lg text-gray-300 mb-6">{error}</p>
                <button
                    onClick={onSessionReset}
                    className="py-3 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold"
                >
                    Reiniciar Sessão
                </button>
            </div>
        );
    }

    if (!gameState) return <div className="text-center text-xl w-full h-screen flex items-center justify-center">Carregando Jogo de Bingo...</div>;

    const lastDrawnNumber = gameState.drawnNumbers[gameState.drawnNumbers.length - 1] || null;

    const renderCards = () => {
        if (isSpectator) {
            // FIX: The type of `playerData` was inferred as `unknown`.
            // Casting the result of `Object.entries` to a typed array resolves the error.
            return (Object.entries(allPlayerCards) as [string, { displayName: string, cards: BingoCardData[] }][]).map(([uid, playerData]) => (
                <div key={uid}>
                    <h3 className="text-lg font-bold text-center text-yellow-300 my-2 sticky top-0 bg-gray-800 py-1 z-10">{playerData.displayName}'s Cards ({playerData.cards.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                        {playerData.cards.map((cardData) => (
                             <BingoCard 
                                key={cardData.id} 
                                numbers={cardData.numbers} 
                                drawnNumbers={gameState.drawnNumbers} 
                                gameStatus={gameState.status}
                                isWinningCard={gameState.status === 'ended' && gameState.winners.some(w => w.uid === uid && JSON.stringify(w.card) === JSON.stringify(cardData.numbers))}
                                lastDrawnNumber={lastDrawnNumber}
                             />
                        ))}
                    </div>
                </div>
            ));
        }
        return (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                {myCards.map((cardData) => (
                    <BingoCard 
                        key={cardData.id} 
                        numbers={cardData.numbers} 
                        drawnNumbers={gameState.drawnNumbers} 
                        gameStatus={gameState.status}
                        isWinningCard={gameState.status === 'ended' && gameState.winners.some(w => w.uid === user.uid && JSON.stringify(w.card) === JSON.stringify(cardData.numbers))}
                        lastDrawnNumber={lastDrawnNumber}
                     />
                ))}
            </div>
        );
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 flex flex-col flex-grow relative h-screen">
             {gameState.status === 'paused' && (
                <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-40 text-center p-4 rounded-lg">
                    <h2 className="text-5xl font-bold text-yellow-400 animate-pulse mb-4">JOGO PAUSADO</h2>
                    {gameState.pauseReason && (
                        <p className="text-xl text-white">Motivo: {gameState.pauseReason}</p>
                    )}
                </div>
            )}
            <header className="flex-shrink-0 flex justify-between items-center bg-gray-900 bg-opacity-70 p-4 rounded-lg mb-4">
                <div>
                    <h1 className="text-3xl font-bold text-purple-400">{isSpectator ? "MODO ESPECTADOR" : "NOITE DO BINGO"}</h1>
                     <p className="text-gray-300">Bem-vindo, {userData.displayName}</p>
                     {!isSpectator && <p className="text-yellow-400">Saldo: <span className="font-bold">{typeof userData.fichas === 'number' ? userData.fichas : '...'} F</span></p>}
                     <p className="text-yellow-400">Prêmio Acumulado: <span className="font-bold">{typeof gameState.prizePool === 'number' ? gameState.prizePool : '0'} F</span></p>
                </div>
                <div className="text-center">
                    {gameState.status === 'running' && lastDrawnNumber && (
                        <div key={lastDrawnNumber} className="last-number-animation">
                            <p className="text-lg">Última Bola:</p> 
                            <span className="font-bold text-6xl text-green-400 drop-shadow-lg">{getBingoLetter(lastDrawnNumber)}-{lastDrawnNumber}</span>
                        </div>
                    )}
                     {gameState.status === 'waiting' && <p className="text-xl font-bold">Aguardando início...</p>}
                     {gameState.status === 'running' && (
                        <p className="text-sm mt-2">Próxima bola em: <span className="font-bold text-xl">{gameState.countdown}s</span></p>
                     )}
                </div>
                <button onClick={onBackToLobby} className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold self-start">&larr; Voltar para o Lobby</button>
            </header>

            {gameState.status === 'ended' && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-gradient-to-br from-purple-800 to-blue-900 text-white p-6 md:p-8 rounded-2xl shadow-2xl w-full max-w-3xl text-center border-2 border-yellow-400">
                        <h2 className="text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-green-400 drop-shadow-lg animate-pulse">
                            BINGO!
                        </h2>
                        <div className="my-6">
                            <h3 className="text-2xl font-bold mb-4">Parabéns ao(s) Vencedor(es)!</h3>
                            {gameState.prizePool > 0 && gameState.winners.length > 0 &&
                              <p className="text-lg text-yellow-300 mb-4">O prêmio de <span className="font-bold">{gameState.prizePool} F</span> foi dividido entre {gameState.winners.length} vencedor(es)!</p>
                            }
                        </div>
                        <p className="mt-4 text-lg">
                            Voltando para o lobby em <span className="font-bold text-2xl text-green-400">{endGameCountdown}s</span>...
                        </p>
                    </div>
                </div>
            )}
            {gameState.status === 'waiting' && gameState.lastWinnerAnnouncement && (
                 <div className="flex-shrink-0 text-center bg-blue-500 text-white p-2 rounded-lg my-2 text-md font-bold">
                    {gameState.lastWinnerAnnouncement}
                </div>
            )}

            <main className="flex-grow flex gap-4 overflow-hidden">
                <div className="w-1/4 bg-gray-800 rounded-lg p-4 flex flex-col overflow-y-auto">
                    <BingoMasterBoard drawnNumbers={gameState.drawnNumbers} />
                     {(gameState.status === 'waiting' || gameState.status === 'running') && (
                        <div className="mt-4">
                            <h2 className="text-xl font-bold text-center mb-2">Ranking de Jogadores ({Object.keys(gameState.players).length})</h2>
                            <div className="pr-2">
                                {sortedPlayers.length > 0 ? (
                                    <ul className="space-y-2">
                                        {sortedPlayers.map(([uid, player]) => (
                                            <li key={uid} className={`flex justify-between items-center p-2 rounded-md transition-colors duration-300 ${uid === user.uid && !isSpectator ? 'bg-purple-800' : 'bg-gray-700'}`}>
                                                <div className="flex items-center flex-1 min-w-0">
                                                    <span className={`w-3 h-3 rounded-full mr-2 flex-shrink-0 ${playerStatuses[uid] === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                    <div className="flex-1 min-w-0">
                                                      <p className="font-semibold text-white truncate" title={player.displayName}>
                                                          {player.displayName}
                                                          {uid === user.uid && !isSpectator && <span className="text-yellow-400 font-normal"> (Você)</span>}
                                                      </p>
                                                      <p className="text-xs text-gray-300">
                                                        Faltam: {player.progress ?? '-'}
                                                      </p>
                                                    </div>
                                                </div>
                                                <div className="text-right ml-2 flex-shrink-0">
                                                    <p className="font-semibold text-white">{player.cardCount || 0}</p>
                                                    <p className="text-xs text-gray-400">Cartela(s)</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-gray-400 text-center italic mt-4">Nenhum jogador no jogo.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="w-3/4 flex flex-col">
                    <div className="flex-shrink-0 bg-gray-800 rounded-lg p-4 mb-4 flex justify-between items-center">
                        <h2 className="text-xl font-bold">{isSpectator ? "Cartelas dos Jogadores" : `Suas Cartelas (${myCards.length})`}</h2>
                    </div>
                    {error && !isSpectator && <p className="text-red-400 text-center mb-2">{error}</p>}
                    <div className="flex-grow overflow-y-auto">
                       {renderCards()}
                    </div>
                </div>
            </main>
        </div>
    );
};