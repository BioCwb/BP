
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { type User } from 'firebase/auth';
import { type UserData } from '../App';
import { db, arrayUnion, increment } from '../firebase/config';
// FIX: Removed unused v9 firestore imports to align with the v8 compatibility syntax.
import { BingoCard } from './BingoCard';
import { calculateCardProgress } from '../utils/bingoUtils';


// Helper function to generate a valid Bingo card
const generateBingoCard = (): number[][] => {
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
    return card;
};

interface GameState {
    status: 'waiting' | 'running' | 'ended';
    drawnNumbers: number[];
    players: { [uid: string]: { displayName: string; cardCount: number; progress?: number; } };
    prizePool: number;
    winners: { uid: string, displayName: string, card: number[][] }[];
    host: string | null;
    countdown: number;
    lastWinnerAnnouncement: string;
}

interface BingoGameProps {
  user: User;
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
    const [myCards, setMyCards] = useState<number[][][]>([]);
    const [error, setError] = useState<string | null>(null);

    // FIX: Switched from v9 doc(db, ...) to v8 db.collection(...).doc(...)
    const gameDocRef = db.collection('games').doc('active_game');
    // FIX: Switched from v9 doc(collection(db,...)) to v8 db.collection(...).doc(...).collection(...)
    const myCardsCollectionRef = db.collection('player_cards').doc(user.uid).collection('cards').doc('active_game');

    useEffect(() => {
        // FIX: Switched from v9 onSnapshot(docRef, ...) to v8 docRef.onSnapshot(...)
        const unsubGame = gameDocRef.onSnapshot((doc) => {
            // FIX: Switched from v9 doc.exists() to v8 doc.exists
            if (doc.exists) {
                setGameState(doc.data() as GameState);
            } else {
                if(user) {
                     // FIX: Switched from v9 runTransaction(db, ...) to v8 db.runTransaction(...)
                     db.runTransaction(async (transaction) => {
                        const gameDoc = await transaction.get(gameDocRef);
                        if (!gameDoc.exists) {
                            const newGameState: GameState = {
                                status: 'waiting', drawnNumbers: [], players: {}, prizePool: 0, winners: [], host: user.uid, countdown: 15, lastWinnerAnnouncement: ""
                            };
                            transaction.set(gameDocRef, newGameState);
                        }
                    });
                }
            }
        });

        // FIX: Switched from v9 onSnapshot(docRef, ...) to v8 docRef.onSnapshot(...)
        const unsubCards = myCardsCollectionRef.onSnapshot((doc) => {
            // FIX: Switched from v9 doc.exists() to v8 doc.exists
            if (doc.exists) {
                setMyCards(doc.data()!.cards || []);
            } else {
                setMyCards([]);
            }
        });

        return () => { unsubGame(); unsubCards(); };
    }, [user.uid, gameDocRef, myCardsCollectionRef]);
    
    const handleBuyCard = async () => {
        setError(null);
        if (myCards.length >= 50) { return setError("You can't have more than 50 cards."); }
        if (userData.fichas < 10) { return setError("Not enough Fichas (F) to buy a card."); }

        try {
            // FIX: Switched from v9 runTransaction(db, ...) to v8 db.runTransaction(...)
            await db.runTransaction(async (transaction) => {
                const userDocRef = db.collection("users").doc(user.uid);
                const userDoc = await transaction.get(userDocRef);
                const gameDoc = await transaction.get(gameDocRef);

                // FIX: Switched from v9 doc.exists() to v8 doc.exists
                if (!userDoc.exists || !gameDoc.exists) throw new Error("Documents not found");
                
                const currentFichas = userDoc.data()!.fichas;
                if (currentFichas < 10) throw new Error("Not enough Fichas!");

                const newCard = generateBingoCard();
                
                transaction.update(userDocRef, { fichas: increment(-10) });

                const gameData = gameDoc.data() as GameState;
                const player = gameData.players[user.uid];

                transaction.update(gameDocRef, {
                    prizePool: increment(9),
                    [`players.${user.uid}`]: {
                        displayName: user.displayName || 'Player',
                        cardCount: (player?.cardCount || 0) + 1,
                        progress: player?.progress ?? 5, // Default progress for a new card is 5 numbers to a line
                    }
                });

                const playerCardsDoc = await transaction.get(myCardsCollectionRef);
                if (playerCardsDoc.exists) {
                    transaction.update(myCardsCollectionRef, { cards: arrayUnion(newCard) });
                } else {
                    transaction.set(myCardsCollectionRef, { cards: [newCard] });
                }
            });
        } catch (e: any) {
            setError(e.message);
        }
    };
    
    // Game loop logic - only runs for the host
    useEffect(() => {
        if (!gameState || gameState.host !== user.uid) return;

        let intervalId: number | undefined;

        if (gameState.status === 'waiting' && Object.keys(gameState.players).length > 0) {
            intervalId = window.setInterval(async () => {
                // FIX: Switched from v9 runTransaction(db, ...) to v8 db.runTransaction(...)
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
                 // FIX: Switched from v9 runTransaction(db, ...) to v8 db.runTransaction(...)
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
             setTimeout(async () => {
                // FIX: Switched from v9 writeBatch(db) to v8 db.batch()
                const batch = db.batch();
                batch.update(gameDocRef, { status: 'waiting', drawnNumbers: [], prizePool: 0, winners: [], countdown: 15, lastWinnerAnnouncement: `Last winner(s): ${gameState.winners.map(w => w.displayName).join(', ')}`});
                
                const playerIds = Object.keys(gameState.players);
                playerIds.forEach(playerId => {
                    const playerCardsRef = db.collection('player_cards').doc(playerId).collection('cards').doc('active_game');
                    batch.delete(playerCardsRef);
                });
                await batch.commit();

            }, 10000); // 10 second delay before new round
        }
        
        return () => clearInterval(intervalId);

    }, [gameState, user.uid, gameDocRef]);
    
    const onBingo = useCallback(async (winningCard: number[][]) => {
        if (!gameState || gameState.status !== 'running' || gameState.winners.some(w => w.uid === user.uid)) return;
        
        const prizePerWinner = Math.floor(gameState.prizePool / (gameState.winners.length + 1));
        const newWinner = { uid: user.uid, displayName: user.displayName || 'Player', card: winningCard };
        const allWinners = [...gameState.winners, newWinner];

        // FIX: Switched from v9 writeBatch(db) to v8 db.batch()
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
        for (const card of myCards) {
            const progress = calculateCardProgress(card, gameState.drawnNumbers);
            if (progress.numbersToWin < bestProgress) {
                bestProgress = progress.numbersToWin;
            }
        }

        const currentProgress = gameState.players[user.uid]?.progress;
        if (bestProgress !== currentProgress) {
            gameDocRef.update({
                [`players.${user.uid}.progress`]: bestProgress
            }).catch(err => console.error("Failed to update progress", err));
        }

    }, [myCards, gameState?.drawnNumbers, gameState?.status, user.uid, gameDocRef]);


    if (!gameState) return <div className="text-center text-xl">Loading Bingo Game...</div>;

    const lastDrawnNumber = gameState.drawnNumbers[gameState.drawnNumbers.length - 1] || null;

    const sortedPlayers = useMemo(() => {
        if (!gameState.players) return [];
        return (Object.entries(gameState.players) as [string, { displayName: string, cardCount: number, progress?: number }][])
            .sort(([, a], [, b]) => {
                const progressA = a.progress ?? 99;
                const progressB = b.progress ?? 99;
                if (progressA !== progressB) {
                    return progressA - progressB;
                }
                return b.cardCount - a.cardCount;
            });
    }, [gameState.players]);

    return (
        <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-screen">
            <header className="flex justify-between items-center bg-gray-900 bg-opacity-70 p-4 rounded-lg mb-4">
                <div>
                    <h1 className="text-3xl font-bold text-purple-400">BINGO NIGHT</h1>
                     <p className="text-gray-300">Welcome, {userData.displayName}</p>
                     <p className="text-yellow-400">Balance: <span className="font-bold">{userData.fichas} F</span></p>
                     <p className="text-yellow-400">Prize Pool: <span className="font-bold">{gameState.prizePool} F</span></p>
                </div>
                <div className="text-center">
                    {gameState.status === 'running' && lastDrawnNumber && (
                        <div key={lastDrawnNumber} className="animate-pulse">
                            <p className="text-lg">Last Ball:</p> 
                            <span className="font-bold text-6xl text-green-400 drop-shadow-lg">{getBingoLetter(lastDrawnNumber)}-{lastDrawnNumber}</span>
                        </div>
                    )}
                    <p className="text-sm mt-2">Next ball in: <span className="font-bold text-xl">{gameState.countdown}s</span></p>
                </div>
                <button onClick={onBackToLobby} className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold self-start">&larr; Back to Lobby</button>
            </header>

            {gameState.status === 'ended' && (
                 <div className="text-center bg-green-800 bg-opacity-80 backdrop-blur-sm text-white p-4 rounded-lg my-4">
                    <h2 className="text-3xl font-bold">BINGO!</h2>
                    <p className="text-xl">Winner(s): {gameState.winners.map(w => w.displayName).join(', ')}</p>
                    <p>Each wins {gameState.winners.length > 0 ? Math.floor(gameState.prizePool / gameState.winners.length) : 0} F!</p>
                     <p className="mt-4 text-sm">New game starting soon...</p>
                     <div className="mt-4">
                         <h3 className="text-lg font-semibold">Winning Card(s):</h3>
                         <div className="flex justify-center gap-4 mt-2 overflow-x-auto p-2">
                             {gameState.winners.map((winner, index) => (
                                 <div key={index} className="flex-shrink-0 w-64">
                                     <BingoCard numbers={winner.card} drawnNumbers={gameState.drawnNumbers} gameStatus="ended" onBingo={()=>{}} isWinningCard={true} />
                                     <p className="text-center font-semibold mt-1">{winner.displayName}'s Card</p>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </div>
            )}
            {gameState.status === 'waiting' && gameState.lastWinnerAnnouncement && (
                 <div className="text-center bg-blue-500 text-white p-2 rounded-lg my-2 text-md font-bold">
                    {gameState.lastWinnerAnnouncement}
                </div>
            )}

            <main className="flex-grow flex gap-4 overflow-hidden">
                <div className="w-1/4 bg-gray-800 rounded-lg p-4 flex flex-col">
                    <div>
                        <h2 className="text-xl font-bold text-center mb-2">Called Numbers ({gameState.drawnNumbers.length}/75)</h2>
                        <div className="grid grid-cols-5 gap-1 text-center">
                            {Array.from({length: 75}, (_, i) => i + 1).map(num => (
                                <div key={num} className={`w-10 h-10 flex items-center justify-center rounded-full font-bold text-sm transition-colors duration-200 ${gameState.drawnNumbers.includes(num) ? 'bg-green-500 text-white' : 'bg-gray-700'}`}>
                                    {num}
                                </div>
                            ))}
                        </div>
                    </div>
                     {(gameState.status === 'waiting' || gameState.status === 'running') && (
                        <div className="flex-1 mt-4 flex flex-col overflow-hidden">
                            <h2 className="text-xl font-bold text-center mb-2">Player Ranking ({Object.keys(gameState.players).length})</h2>
                            <div className="overflow-y-auto pr-2">
                                {sortedPlayers.length > 0 ? (
                                    <ul className="space-y-2">
                                        {sortedPlayers.map(([uid, player]) => (
                                            <li key={uid} className={`flex justify-between items-center p-2 rounded-md transition-colors duration-300 ${uid === user.uid ? 'bg-purple-800' : 'bg-gray-700'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-white truncate" title={player.displayName}>
                                                        {player.displayName}
                                                        {uid === user.uid && <span className="text-yellow-400 font-normal"> (You)</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-400">{player.cardCount} card(s)</p>
                                                </div>
                                                {player.progress !== undefined && player.progress > 0 && gameState.status === 'running' && (
                                                    <span className="text-sm bg-blue-500 text-white font-bold py-1 px-2 rounded-full flex-shrink-0 ml-2">
                                                        Needs {player.progress}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-gray-400 text-center italic mt-4">No players have bought cards yet.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="w-3/4 flex flex-col">
                    <div className="bg-gray-800 rounded-lg p-4 mb-4 flex justify-between items-center">
                        <h2 className="text-xl font-bold">Your Cards ({myCards.length})</h2>
                        <button onClick={handleBuyCard} disabled={gameState.status !== 'waiting'} className="py-2 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">Buy Card (10 F)</button>
                    </div>
                    {error && <p className="text-red-400 text-center mb-2">{error}</p>}
                    <div className="flex-grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                        {myCards.map((cardNumbers, index) => (
                            <BingoCard key={index} numbers={cardNumbers} drawnNumbers={gameState.drawnNumbers} onBingo={onBingo} gameStatus={gameState.status} />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};
