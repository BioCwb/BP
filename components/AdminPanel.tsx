import React, { useState, useEffect, useMemo } from 'react';
import type firebase from 'firebase/compat/app';
import { db, serverTimestamp, increment, auth, EmailAuthProvider } from '../firebase/config';
import type { GameState } from './BingoGame';

interface AdminPanelProps {
    user: firebase.User;
    onBack: () => void;
}

interface BingoCardData {
    id: string;
    numbers: number[];
}

interface PurchaseHistoryItem {
    id: string;
    playerName: string;
    cardId: string;
    timestamp: firebase.firestore.Timestamp;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ user, onBack }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
    const [lobbyTime, setLobbyTime] = useState(30);
    const [drawTime, setDrawTime] = useState(8);
    const [endTime, setEndTime] = useState(15);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const [playerCardDetails, setPlayerCardDetails] = useState<{ [uid: string]: BingoCardData[] }>({});
    const [isLoadingCards, setIsLoadingCards] = useState(false);
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);

    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
    const purchaseHistoryCollectionRef = useMemo(() => db.collection('purchase_history'), []);

    useEffect(() => {
        const unsubscribe = gameDocRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data() as GameState;
                setGameState(data);
                setLobbyTime(data.lobbyCountdownDuration || 30);
                setDrawTime(data.drawIntervalDuration || 8);
                setEndTime(data.endGameDelayDuration || 15);
            } else {
                setGameState(null);
            }
        });

        const unsubHistory = purchaseHistoryCollectionRef.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseHistoryItem));
            setPurchaseHistory(history);
        });

        return () => { 
            unsubscribe();
            unsubHistory();
        };
    }, [gameDocRef, purchaseHistoryCollectionRef]);

    useEffect(() => {
        const statusCollectionRef = db.collection('player_status');

        const countOnlinePlayers = () => {
            const thirtySecondsAgo = new Date(Date.now() - 30000);
            statusCollectionRef.where('lastSeen', '>', thirtySecondsAgo).get()
                .then(snapshot => {
                    setOnlinePlayersCount(snapshot.size);
                })
                .catch(err => {
                    console.error("Error getting online player count: ", err);
                });
        };

        countOnlinePlayers();
        const intervalId = setInterval(countOnlinePlayers, 10000);

        return () => clearInterval(intervalId);
    }, []);
    
    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleTogglePlayer = async (uid: string) => {
        if (expandedPlayerId === uid) {
            setExpandedPlayerId(null);
            return;
        }

        setExpandedPlayerId(uid);
        if (!playerCardDetails[uid]) {
            setIsLoadingCards(true);
            try {
                const docRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                const doc = await docRef.get();
                setPlayerCardDetails(prev => ({ ...prev, [uid]: doc.exists() ? (doc.data()?.cards as BingoCardData[] || []) : [] }));
            } catch (error) {
                console.error("Error fetching player cards:", error);
                showMessage('error', 'Falha ao carregar cartelas do jogador.');
            } finally {
                setIsLoadingCards(false);
            }
        }
    };

    const handleRemoveCard = async (playerId: string) => {
        if (!gameState || !gameState.players[playerId]) return;
    
        const justification = window.prompt(`Justifique a remoção da última cartela de ${gameState.players[playerId].displayName}:`);
        if (!justification || justification.trim() === '') {
            showMessage('error', 'A justificação é obrigatória.');
            return;
        }
    
        const playerCardsRef = db.collection('player_cards').doc(playerId).collection('cards').doc('active_game');
        const userRef = db.collection('users').doc(playerId);
        const adminLogRef = db.collection('admin_logs').doc();
    
        try {
            await db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameDocRef);
                const playerCardsDoc = await transaction.get(playerCardsRef);
                const userDoc = await transaction.get(userRef);
    
                if (!gameDoc.exists || !playerCardsDoc.exists || !userDoc.exists) {
                    throw new Error("Não foi possível encontrar todos os dados necessários.");
                }
    
                const gameData = gameDoc.data() as GameState;
                const playerCardsData = playerCardsDoc.data();
                
                if (!playerCardsData || !playerCardsData.cards || playerCardsData.cards.length === 0) {
                    throw new Error("O jogador não tem cartelas para remover.");
                }
    
                const updatedCards = [...playerCardsData.cards];
                updatedCards.pop();
    
                transaction.update(playerCardsRef, { cards: updatedCards });
                transaction.update(gameDocRef, {
                    prizePool: increment(-9),
                    [`players.${playerId}.cardCount`]: increment(-1),
                });
                transaction.update(userRef, { fichas: increment(10) });
    
                transaction.set(adminLogRef, {
                    adminUid: user.uid,
                    adminName: user.displayName,
                    targetUid: playerId,
                    targetName: gameData.players[playerId].displayName,
                    action: 'remove_card',
                    justification: justification,
                    timestamp: serverTimestamp(),
                });
            });
    
            showMessage('success', 'Cartela removida e jogador reembolsado.');
        } catch (error: any) {
            console.error("Erro ao remover cartela:", error);
            showMessage('error', error.message || 'Falha ao remover a cartela.');
        }
    };

    const handleSaveSettings = async () => {
        try {
            await gameDocRef.update({
                lobbyCountdownDuration: Number(lobbyTime),
                drawIntervalDuration: Number(drawTime),
                endGameDelayDuration: Number(endTime),
            });
            showMessage('success', 'Configurações salvas com sucesso!');
        } catch (error) {
            console.error("Failed to save settings:", error);
            showMessage('error', 'Falha ao salvar configurações.');
        }
    };

    const { totalPlayers, totalCards } = useMemo(() => {
        if (!gameState?.players) {
            return { totalPlayers: 0, totalCards: 0 };
        }
        const playersArray = Object.values(gameState.players) as { cardCount: number }[];
        const cardCount = playersArray.reduce((acc, player) => acc + (player.cardCount || 0), 0);
        return { totalPlayers: playersArray.length, totalCards: cardCount };
    }, [gameState?.players]);

    const canForceStart = gameState?.status === 'waiting' && totalPlayers >= 2 && totalCards >= 2;

    const handleForceStart = async () => {
        if (canForceStart) {
            try {
                await gameDocRef.update({ status: 'running', countdown: gameState!.drawIntervalDuration || 5 });
                showMessage('success', 'Jogo iniciado forçadamente!');
            } catch (error) {
                showMessage('error', 'Falha ao iniciar o jogo.');
            }
        } else {
            showMessage('error', 'O jogo requer no mínimo 2 jogadores e 2 cartelas vendidas para iniciar.');
        }
    };
    
    const handleResetGame = async () => {
        if (window.confirm('Tem certeza que deseja resetar o jogo? Isso limpará todos os jogadores e cartelas.')) {
            if (!gameState) {
                showMessage('error', 'Estado do jogo não encontrado.');
                return;
            }
             try {
                const announcement = gameState.winners.length ? `Último(s) vencedor(es): ${gameState.winners.map(w => w.displayName).join(', ')}` : "Jogo resetado pelo administrador.";
                const batch = db.batch();

                if (gameState.status === 'ended') {
                    const historyRef = db.collection('game_history').doc();
                    batch.set(historyRef, {
                        winners: gameState.winners,
                        drawnNumbers: gameState.drawnNumbers,
                        prizePool: gameState.prizePool,
                        completedAt: serverTimestamp()
                    });
                }
                
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

                const purchaseHistorySnapshot = await purchaseHistoryCollectionRef.get();
                purchaseHistorySnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                showMessage('success', 'Jogo resetado com sucesso!');
            } catch (error) {
                showMessage('error', 'Falha ao resetar o jogo.');
                console.error(error);
            }
        }
    };

    const handleTogglePause = async () => {
        if (!gameState) return;
        if (gameState.status === 'running') {
            const reason = window.prompt('Por favor, informe o motivo da pausa:', 'Pausa técnica');
            if (reason) {
                try {
                    await gameDocRef.update({ status: 'paused', pauseReason: reason });
                    showMessage('success', 'Jogo pausado com sucesso.');
                } catch (error) {
                    showMessage('error', 'Falha ao pausar o jogo.');
                }
            }
        } else if (gameState.status === 'paused') {
            try {
                await gameDocRef.update({ 
                    status: 'running', 
                    pauseReason: '', 
                    countdown: gameState.drawIntervalDuration || 5 
                });
                showMessage('success', 'Jogo retomado com sucesso.');
            } catch (error) {
                showMessage('error', 'Falha ao retomar o jogo.');
            }
        }
    };
    
    const handleClearAllCards = async () => {
        if (!gameState || Object.keys(gameState.players).length === 0) {
            showMessage('error', 'Não há jogadores com cartelas para limpar.');
            return;
        }

        const isEmailProvider = user.providerData.some(p => p.providerId === 'password');
        if (!isEmailProvider) {
            showMessage('error', 'A verificação de senha só está disponível para administradores com login via e-mail/senha.');
            return;
        }

        const password = window.prompt("Para confirmar, digite sua senha de administrador:");
        if (!password) return;

        const justification = window.prompt("Justifique esta ação (obrigatório):");
        if (!justification || justification.trim() === '') {
            showMessage('error', 'A justificação é obrigatória.');
            return;
        }

        if (!user.email || !auth.currentUser) {
            showMessage('error', 'Não foi possível verificar o e-mail do administrador.');
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, password);
            await auth.currentUser.reauthenticateWithCredential(credential);

            await db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameDocRef);
                if (!gameDoc.exists) throw new Error("Jogo não encontrado.");
                
                const gameData = gameDoc.data() as GameState;
                const players = gameData.players;
                const playerIds = Object.keys(players);

                if (playerIds.length === 0) return;

                for (const uid of playerIds) {
                    const playerInfo = players[uid];
                    const userRef = db.collection('users').doc(uid);
                    const cardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');

                    const userDoc = await transaction.get(userRef);
                    const cardsDoc = await transaction.get(cardsRef);

                    if (userDoc.exists) {
                        const refundAmount = (playerInfo.cardCount || 0) * 10;
                        if (refundAmount > 0) {
                            transaction.update(userRef, { fichas: increment(refundAmount) });
                        }
                    }
                    if (cardsDoc.exists) {
                        transaction.update(cardsRef, { cards: [] });
                    }
                }

                transaction.update(gameDocRef, {
                    players: {},
                    prizePool: 0,
                });

                const adminLogRef = db.collection('admin_logs').doc();
                transaction.set(adminLogRef, {
                    adminUid: user.uid,
                    adminName: user.displayName,
                    action: 'clear_all_cards',
                    justification,
                    timestamp: serverTimestamp(),
                });
            });

            showMessage('success', 'Todas as cartelas foram limpas e os jogadores reembolsados.');

        } catch (err: any) {
            if (err.code === 'auth/wrong-password') {
                showMessage('error', 'Senha incorreta. Ação cancelada.');
            } else {
                console.error("Erro ao limpar todas as cartelas:", err);
                showMessage('error', err.message || 'Falha ao limpar as cartelas.');
            }
        }
    };

    return (
        <div className="w-full max-w-6xl bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold">Painel de Administração</h2>
                <button onClick={onBack} className="text-gray-300 hover:text-white">&larr; Voltar para o Lobby</button>
            </div>

            {message && (
                <div className={`mb-4 text-center p-3 rounded-lg ${message.type === 'success' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {message.text}
                </div>
            )}

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
                <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Status do Jogo</p>
                    <p className="text-2xl font-bold capitalize">{gameState?.status || 'N/A'}</p>
                </div>
                 <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Bolas Sorteadas</p>
                    <p className="text-2xl font-bold">{gameState?.drawnNumbers.length || 0} / 60</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Jogadores Online</p>
                    <p className="text-2xl font-bold">{onlinePlayersCount}</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Prêmio Acumulado</p>
                    <p className="text-2xl font-bold">{gameState?.prizePool || 0} F</p>
                </div>
            </div>
            
            {/* Main 3-Column Content Area */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Coluna 1: Controles e Configurações */}
                <div className="flex flex-col gap-6">
                    <div className="bg-gray-900 p-4 rounded-lg">
                         <h3 className="text-xl font-semibold mb-4 text-center">Controles do Jogo</h3>
                         <div className="space-y-2">
                            <div className="flex gap-2">
                                <button onClick={handleForceStart} disabled={!canForceStart} className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">Forçar Início</button>
                                {(gameState?.status === 'running' || gameState?.status === 'paused') && (
                                    <button 
                                        onClick={handleTogglePause}
                                        className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
                                            gameState.status === 'running'
                                            ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                        }`}
                                    >
                                        {gameState.status === 'running' ? 'Pausar Jogo' : 'Retomar Jogo'}
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleResetGame} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">Resetar Jogo</button>
                                <button onClick={handleClearAllCards} disabled={gameState?.status !== 'waiting' || totalPlayers === 0} className="flex-1 py-2 px-4 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">
                                    Limpar Todas as Cartelas
                                </button>
                            </div>
                         </div>
                         {!canForceStart && gameState?.status === 'waiting' && (
                            <p className="text-center text-sm text-yellow-400 mt-2">
                                Para iniciar: mínimo de 2 jogadores e 2 cartelas vendidas.<br />
                                (Atualmente: {totalPlayers} jogador(es), {totalCards} cartela(s))
                            </p>
                         )}
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-center">Configurações de Tempo (segundos)</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label htmlFor="lobby-time">Tempo de Espera no Lobby:</label>
                                <input id="lobby-time" type="number" value={lobbyTime} onChange={e => setLobbyTime(Number(e.target.value))} className="w-24 p-2 bg-gray-700 border border-gray-600 rounded-lg text-center" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label htmlFor="draw-time">Intervalo entre Sorteios:</label>
                                <input id="draw-time" type="number" value={drawTime} onChange={e => setDrawTime(Number(e.target.value))} className="w-24 p-2 bg-gray-700 border border-gray-600 rounded-lg text-center" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label htmlFor="end-time">Intervalo Pós-Jogo:</label>
                                <input id="end-time" type="number" value={endTime} onChange={e => setEndTime(Number(e.target.value))} className="w-24 p-2 bg-gray-700 border border-gray-600 rounded-lg text-center" />
                            </div>
                        </div>
                        <button onClick={handleSaveSettings} className="mt-6 w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold">Salvar Configurações</button>
                    </div>
                </div>
                {/* Coluna 2: Gerenciamento de Jogadores */}
                <div className="bg-gray-900 p-4 rounded-lg">
                    <h3 className="text-xl font-semibold mb-4 text-center">Gerenciamento de Jogadores</h3>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                        {gameState && Object.keys(gameState.players).length > 0 ? (
                            (Object.entries(gameState.players) as [string, { displayName: string; cardCount: number; }][]).map(([uid, player]) => (
                                <div key={uid} className="bg-gray-700 rounded-md transition-all duration-300">
                                    <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-600" onClick={() => handleTogglePlayer(uid)}>
                                        <div>
                                            <p className="font-semibold">{player.displayName}</p>
                                            <p className="text-sm text-gray-400">{player.cardCount} cartela(s)</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveCard(uid); }}
                                                disabled={!player.cardCount || player.cardCount === 0 || gameState.status !== 'waiting'}
                                                className="py-1 px-3 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                                            >
                                                Remover
                                            </button>
                                            <span className={`transform transition-transform text-gray-400 ${expandedPlayerId === uid ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                                        </div>
                                    </div>
                                    {expandedPlayerId === uid && (
                                        <div className="p-2 border-t border-gray-600 bg-gray-800">
                                            {isLoadingCards && <p className="text-sm text-center text-gray-400">Carregando...</p>}
                                            {!isLoadingCards && playerCardDetails[uid] && playerCardDetails[uid].length > 0 ? (
                                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                                    {playerCardDetails[uid].map((card, index) => (
                                                        <div key={card.id} className="bg-gray-900 p-2 rounded">
                                                            <p className="text-xs font-mono text-purple-300">Cartela #{index + 1} (ID: {card.id.substring(0,8)})</p>
                                                            <div className="grid grid-cols-5 gap-1 text-center text-sm font-mono">
                                                                {card.numbers.map((num, idx) => (
                                                                    <span key={idx} className={`p-1 rounded ${num === 0 ? 'text-yellow-400 font-bold' : ''}`}>
                                                                        {num === 0 ? '★' : num}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                !isLoadingCards && <p className="text-sm text-center text-gray-500">Nenhuma cartela para exibir.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-gray-400 italic">Nenhum jogador na partida.</p>
                        )}
                    </div>
                </div>
                {/* Coluna 3: Histórico de Vendas */}
                 <div className="bg-gray-900 p-4 rounded-lg">
                    <h3 className="text-xl font-semibold mb-4 text-center">Histórico de Vendas</h3>
                     <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                        {purchaseHistory.length > 0 ? (
                            purchaseHistory.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded-md text-sm">
                                    <p className="font-semibold text-purple-300">{item.playerName}</p>
                                    <p className="text-xs text-gray-400 font-mono">ID: {item.cardId.substring(0, 12)}</p>
                                    <p className="text-xs text-gray-500 text-right">{item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString('pt-BR') : '...'}</p>
                                </div>
                            ))
                        ) : (
                             <p className="text-center text-gray-400 italic">Nenhuma cartela vendida nesta rodada.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};