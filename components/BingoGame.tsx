import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type firebase from 'firebase/compat/app';
import { type UserData } from '../App';
import { db, arrayUnion, increment } from '../firebase/config';
// FIX: Removed unused v9 firestore imports to align with the v8 compatibility syntax.
import { BingoCard } from './BingoCard';
import { calculateCardProgress } from '../utils/bingoUtils';
import { BingoMasterBoard } from './BingoMasterBoard';
import { useLanguage } from '../context/LanguageContext';


// Helper function to generate a valid Bingo card as a flat array
const generateBingoCard = (): number[] => {
    const card: number[][] = Array(5).fill(null).map(() => Array(5).fill(0));
    const ranges = [
        { col: 0, min: 1, max: 15 },
        { col: 1, min: 16, max: 30 },
        { col: 2, min: 31, max: 45 },
        { col: 3, min: 46, max: 60 },
        { col: 4, min: 61, max: 75 },
    ];
    
    for (const range of ranges) {
        const columnNumbers = new Set<number>();
        while (columnNumbers.size < 5) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            columnNumbers.add(num);
        }
        const nums = Array.from(columnNumbers);
        for (let row = 0; row < 5; row++) {
            if (range.col === 2 && row === 2) { // Free space
                card[row][range.col] = 0;
            } else {
                card[row][range.col] = nums[row];
            }
        }
    }
    return card.flat();
};

interface GameState {
    status: 'waiting' | 'running' | 'ended';
    drawnNumbers: number[];
    players: { [uid: string]: { displayName: string; cardCount: number; progress?: number; } };
    prizePool: number;
    winners: { uid: string, displayName: string, card: number[] }[];
    host: string | null;
    countdown: number;
    lastWinnerAnnouncement: string;
}

interface BingoCardData {
    numbers: number[];
}

interface BingoGameProps {
  user: firebase.User;
  userData: UserData;
  onBackToLobby: () => void;
}

const getBingoLetter = (num: number) => {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    if (num <= 75) return 'O';
    return '';
};


export const BingoGame: React.FC<BingoGameProps> = ({ user, userData, onBackToLobby }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myCards, setMyCards] = useState<BingoCardData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [endGameCountdown, setEndGameCountdown] = useState(10);
    const { t } = useLanguage();

    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
    const myCardsCollectionRef = useMemo(() => db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game'), [user.uid]);

    useEffect(() => {
        const unsubGame = gameDocRef.onSnapshot((doc) => {
            if (doc.exists) {
                setGameState(doc.data() as GameState);
            } else {
                if (user) {
                     db.runTransaction(async (transaction) => {
                        const gameDoc = await transaction.get(gameDocRef);
                        if (!gameDoc.exists) {
                            const newGameState: GameState = {
                                status: 'waiting', drawnNumbers: [], players: {}, prizePool: 0, winners: [], host: user.uid, countdown: 15, lastWinnerAnnouncement: ""
                            };
                            transaction.set(gameDocRef, newGameState);
                        }
                    }).catch((err) => {
                        console.error("Game creation transaction failed:", err);
                        setError(t('error.createGameFailed'));
                    });
                }
            }
        }, (err) => {
            console.error("Error fetching game state:", err);
            setError(t('error.connectGameFailed'));
        });

        const unsubCards = myCardsCollectionRef.onSnapshot((doc) => {
            if (doc.exists) {
                setMyCards(doc.data()!.cards || []);
            } else {
                setMyCards([]);
            }
        }, (err) => {
            console.error("Error fetching player cards:", err);
            setError(t('error.loadCardsFailed'));
        });

        return () => { unsubGame(); unsubCards(); };
    }, [user, gameDocRef, myCardsCollectionRef, t]);
    
    // Countdown timer for the end-of-game screen
    useEffect(() => {
        if (gameState?.status === 'ended') {
            setEndGameCountdown(10); // Reset on game end
            const timer = setInterval(() => {
                setEndGameCountdown(prev => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState?.status]);
    
    const handleBuyCard = async () => {
        setError(null);
        if (myCards.length >= 50) { return setError(t('error.maxCards')); }
        if (userData.fichas < 10) { return setError(t('error.notEnoughFichas')); }

        try {
            await db.runTransaction(async (transaction) => {
                // --- Step 1: All reads must be first ---
                const userDocRef = db.collection("users").doc(user.uid);
                const userDoc = await transaction.get(userDocRef);
                const gameDoc = await transaction.get(gameDocRef);
                const playerCardsDoc = await transaction.get(myCardsCollectionRef);

                // --- Step 2: Validation ---
                if (!userDoc.exists || !gameDoc.exists) throw new Error(t('error.userOrGameNotFound'));
                
                const currentFichas = userDoc.data()!.fichas;
                if (currentFichas < 10) throw new Error(t('error.notEnoughFichas'));

                // --- Step 3: Logic ---
                const newCardData: BingoCardData = { numbers: generateBingoCard() };
                const gameData = gameDoc.data() as GameState;
                const player = gameData.players?.[user.uid];

                // --- Step 4: All writes must be last ---
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
        }
    };
    
    // Game loop logic - only runs for the host
    useEffect(() => {
        if (!gameState || gameState.host !== user.uid) return;

        let intervalId: number | undefined;
        let timeoutId: number | undefined;

        if (gameState.status === 'waiting' && Object.keys(gameState.players).length > 0) {
            intervalId = window.setInterval(async () => {
                await db.runTransaction(async (t) => {
                    const gameDoc = await t.get(gameDocRef);
                    if (!gameDoc.exists) return;
                    const currentCountdown = gameDoc.data()!.countdown;
                    if (currentCountdown <= 1) {
                         t.update(gameDocRef, { status: 'running', countdown: 5 });
                    } else {
                         t.update(gameDocRef, { countdown: currentCountdown - 1 });
                    }
                });
            }, 1000);
        } else if (gameState.status === 'running') {
            intervalId = window.setInterval(async () => {
                 await db.runTransaction(async (t) => {
                    const gameDoc = await t.get(gameDocRef);
                    if (!gameDoc.exists) return;
                    const data = gameDoc.data() as GameState;
                    if (data.status !== 'running') return;
                    
                    const currentCountdown = data.countdown;
                    if (currentCountdown <= 1) {
                        const drawn = data.drawnNumbers;
                        if (drawn.length >= 75) {
                             t.update(gameDocRef, { status: 'ended' });
                             return;
                        }
                        let newNumber;
                        do {
                            newNumber = Math.floor(Math.random() * 75) + 1;
                        } while(drawn.includes(newNumber));
                        t.update(gameDocRef, { drawnNumbers: [...drawn, newNumber], countdown: 5 });
                    } else {
                        t.update(gameDocRef, { countdown: currentCountdown - 1 });
                    }
                });
            }, 1000);
        } else if (gameState.status === 'ended') {
             timeoutId = window.setTimeout(async () => {
                const winnerNames = gameState.winners.map(w => w.displayName).join(', ');
                const announcement = winnerNames ? t('game.lastWinner', { winners: winnerNames }) : "";

                const batch = db.batch();
                batch.update(gameDocRef, { status: 'waiting', drawnNumbers: [], prizePool: 0, winners: [], countdown: 15, lastWinnerAnnouncement: announcement});
                
                const playerIds = Object.keys(gameState.players);
                playerIds.forEach(playerId => {
                    const playerCardsRef = db.collection('player_cards').doc(playerId).collection('cards').doc('active_game');
                    batch.delete(playerCardsRef);
                });
                await batch.commit();

            }, 10000); // 10 second delay before new round
        }
        
        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };

    }, [gameState, user.uid, gameDocRef, t]);
    
    const onBingo = useCallback(async (winningCard: number[]) => {
        if (!gameState || gameState.status !== 'running' || gameState.winners.some(w => w.uid === user.uid)) return;
        
        const prizePerWinner = Math.floor(gameState.prizePool / (gameState.winners.length + 1));
        const newWinner = { uid: user.uid, displayName: user.displayName || 'Player', card: winningCard };
        const allWinners = [...gameState.winners, newWinner];

        const batch = db.batch();
        batch.update(gameDocRef, { 
            status: 'ended', 
            winners: allWinners
        });
        
        for(const winner of allWinners) {
            const userDocRef = db.collection("users").doc(winner.uid);
            batch.update(userDocRef, { fichas: increment(prizePerWinner) });
        }
        
        await batch.commit();

    }, [gameState, user, gameDocRef]);
    
     // Player Progress Update Effect
    useEffect(() => {
        if (!myCards.length || !gameState || gameState.status !== 'running') return;
        
        let bestProgress = 5; // Default best is 5 numbers for a line
        for (const cardData of myCards) {
            const progress = calculateCardProgress(cardData.numbers, gameState.drawnNumbers);
            if (progress.numbersToWin < bestProgress) {
                bestProgress = progress.numbersToWin;
            }
        }

        const currentProgress = gameState.players?.[user.uid]?.progress;
        if (bestProgress !== currentProgress) {
            gameDocRef.update({
                [`players.${user.uid}.progress`]: bestProgress
            }).catch(err => console.error("Failed to update progress", err));
        }

    }, [myCards, gameState, user.uid, gameDocRef]);

    const sortedPlayers = useMemo(() => {
        // This hook is moved before the early return to comply with the Rules of Hooks.
        // It's also made safe to handle cases where gameState or gameState.players might be null.
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


    if (!gameState) return <div className="text-center text-xl">{t('game.loading')}</div>;

    const lastDrawnNumber = gameState.drawnNumbers[gameState.drawnNumbers.length - 1] || null;

    return (
        <div className="w-full max-w-7xl mx-auto p-4 flex flex-col flex-grow">
            <header className="flex justify-between items-center bg-gray-900 bg-opacity-70 p-4 rounded-lg mb-4">
                <div>
                    <h1 className="text-3xl font-bold text-purple-400">{t('app.title')}</h1>
                     <p className="text-gray-300">{t('lobby.welcome', { displayName: userData.displayName })}</p>
                     <p className="text-yellow-400">{t('game.balance')}: <span className="font-bold">{typeof userData.fichas === 'number' ? userData.fichas : '...'} F</span></p>
                     <p className="text-yellow-400">{t('game.prizePool')}: <span className="font-bold">{typeof gameState.prizePool === 'number' ? gameState.prizePool : '0'} F</span></p>
                </div>
                <div className="text-center">
                    {gameState.status === 'running' && lastDrawnNumber && (
                        <div key={lastDrawnNumber} className="animate-pulse">
                            <p className="text-lg">{t('game.lastBall')}:</p> 
                            <span className="font-bold text-6xl text-green-400 drop-shadow-lg">{getBingoLetter(lastDrawnNumber)}-{lastDrawnNumber}</span>
                        </div>
                    )}
                    <p className="text-sm mt-2">{t('game.nextBall')}: <span className="font-bold text-xl">{gameState.countdown}s</span></p>
                </div>
                <button onClick={onBackToLobby} className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold self-start">&larr; {t('profile.backToLobby')}</button>
            </header>

            {gameState.status === 'ended' && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-gradient-to-br from-purple-800 to-blue-900 text-white p-6 md:p-8 rounded-2xl shadow-2xl w-full max-w-3xl text-center border-2 border-yellow-400">
                        <h2 className="text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-green-400 drop-shadow-lg animate-pulse">
                            BINGO!
                        </h2>
                        
                        <div className="my-6">
                            <h3 className="text-2xl font-bold mb-4">{t('game.congratsWinners')}</h3>
                            <div className="space-y-3 max-w-md mx-auto">
                                {gameState.winners.map((winner, index) => (
                                    <div key={index} className="bg-gray-900 bg-opacity-50 p-3 rounded-lg flex justify-between items-center text-lg">
                                        <span className="font-semibold">{winner.displayName}</span>
                                        <span className="font-bold text-yellow-400 text-xl">
                                            + {gameState.winners.length > 0 ? Math.floor(gameState.prizePool / gameState.winners.length) : 0} F
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {gameState.winners.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xl font-semibold mb-2">{t('game.winningCards')}:</h3>
                                <div className="flex justify-center flex-wrap gap-4 mt-2 p-2">
                                    {gameState.winners.map((winner, index) => (
                                        <div key={index} className="flex-shrink-0 w-48 md:w-56">
                                            <BingoCard numbers={winner.card} drawnNumbers={gameState.drawnNumbers} gameStatus="ended" onBingo={()=>{}} isWinningCard={true} />
                                            <p className="text-center font-semibold mt-1 text-sm">{t('game.winnersCard', { displayName: winner.displayName })}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <p className="mt-4 text-lg">
                            {t('game.newGameIn')} <span className="font-bold text-2xl text-green-400">{endGameCountdown}s</span>...
                        </p>
                    </div>
                </div>
            )}
            {gameState.status === 'waiting' && gameState.lastWinnerAnnouncement && (
                 <div className="text-center bg-blue-500 text-white p-2 rounded-lg my-2 text-md font-bold">
                    {gameState.lastWinnerAnnouncement}
                </div>
            )}

            <main className="flex-grow flex gap-4 overflow-hidden">
                <div className="w-1/4 bg-gray-800 rounded-lg p-4 flex flex-col overflow-y-auto">
                    <BingoMasterBoard drawnNumbers={gameState.drawnNumbers} />
                    
                     {(gameState.status === 'waiting' || gameState.status === 'running') && (
                        <div className="mt-4">
                            <h2 className="text-xl font-bold text-center mb-2">{t('game.playerRanking', { count: Object.keys(gameState.players).length })}</h2>
                            <div className="pr-2">
                                {sortedPlayers.length > 0 ? (
                                    <ul className="space-y-2">
                                        {sortedPlayers.map(([uid, player]) => (
                                            <li key={uid} className={`flex justify-between items-center p-2 rounded-md transition-colors duration-300 ${uid === user.uid ? 'bg-purple-800' : 'bg-gray-700'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-white truncate" title={player.displayName}>
                                                        {player.displayName}
                                                        {uid === user.uid && <span className="text-yellow-400 font-normal"> ({t('game.you')})</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-400">{t('game.cardsCount', { count: typeof player.cardCount === 'number' ? player.cardCount : '?' })}</p>
                                                </div>
                                                {player.progress !== undefined && typeof player.progress === 'number' && player.progress > 0 && gameState.status === 'running' && (
                                                    <span className="text-sm bg-blue-500 text-white font-bold py-1 px-2 rounded-full flex-shrink-0 ml-2">
                                                        {t('game.needs', { count: player.progress })}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-gray-400 text-center italic mt-4">{t('game.noPlayers')}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="w-3/4 flex flex-col">
                    <div className="bg-gray-800 rounded-lg p-4 mb-4 flex justify-between items-center">
                        <h2 className="text-xl font-bold">{t('game.yourCards', { count: myCards.length })}</h2>
                        <button onClick={handleBuyCard} disabled={gameState.status !== 'waiting'} className="py-2 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">{t('game.buyCard')}</button>
                    </div>
                    {error && <p className="text-red-400 text-center mb-2">{error}</p>}
                    <div className="flex-grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                        {myCards.map((cardData, index) => (
                            <BingoCard key={index} numbers={cardData.numbers} drawnNumbers={gameState.drawnNumbers} onBingo={onBingo} gameStatus={gameState.status} />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};