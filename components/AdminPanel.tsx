import React, { useState, useEffect, useMemo } from 'react';
import type firebase from 'firebase/compat/app';
import { db, serverTimestamp, increment, auth, EmailAuthProvider, FieldPath } from '../firebase/config';
import type { GameState } from './BingoGame';
import { TrashIcon } from './icons/TrashIcon';
import { EyeIcon } from './icons/EyeIcon';
import { useNotification } from '../context/NotificationContext';

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
    roundId?: string;
}

interface ChatMessage {
    id: string;
    uid: string;
    displayName: string;
    text: string;
    timestamp: firebase.firestore.Timestamp;
}

interface AdminLogItem {
    id: string;
    adminName: string;
    action: string;
    details?: any;
    justification?: string;
    timestamp: firebase.firestore.Timestamp;
}

interface OnlinePlayer {
    uid: string;
    displayName: string;
    cardCount: number;
}

type AdminTab = 'overview' | 'players' | 'logs';

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors duration-300 focus:outline-none ${
            isActive
                ? 'bg-gray-900 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
        }`}
    >
        {children}
    </button>
);


export const AdminPanel: React.FC<AdminPanelProps> = ({ user, onBack }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
    const [allOnlinePlayers, setAllOnlinePlayers] = useState<OnlinePlayer[]>([]);
    const [lobbyTime, setLobbyTime] = useState(30);
    const [drawTime, setDrawTime] = useState(8);
    const [endTime, setEndTime] = useState(15);
    const { showNotification } = useNotification();
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const [playerCardDetails, setPlayerCardDetails] = useState<{ [uid: string]: BingoCardData[] }>({});
    const [isLoadingCards, setIsLoadingCards] = useState(false);
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [adminLogs, setAdminLogs] = useState<AdminLogItem[]>([]);
    const [purchaseHistorySearch, setPurchaseHistorySearch] = useState('');
    const [chatSearch, setChatSearch] = useState('');
    const [adminLogSearch, setAdminLogSearch] = useState('');
    const [selectedCardModal, setSelectedCardModal] = useState<BingoCardData | null>(null);
    const [activeTab, setActiveTab] = useState<AdminTab>('players');

    // State for the "Clear All Cards" confirmation modal
    const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
    const [clearAllPassword, setClearAllPassword] = useState('');
    const [clearAllJustification, setClearAllJustification] = useState('');
    const [clearAllError, setClearAllError] = useState<string | null>(null);
    const [isClearingCards, setIsClearingCards] = useState(false);

    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
    const purchaseHistoryCollectionRef = useMemo(() => db.collection('purchase_history'), []);
    const chatCollectionRef = useMemo(() => db.collection('chat'), []);
    const adminLogsCollectionRef = useMemo(() => db.collection('admin_logs'), []);

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

        const unsubChat = chatCollectionRef.orderBy('timestamp', 'desc').limit(100).onSnapshot((snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
            setChatMessages(messages);
        });

        const unsubLogs = adminLogsCollectionRef.orderBy('timestamp', 'desc').limit(100).onSnapshot((snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminLogItem));
            setAdminLogs(logs);
        });

        return () => { 
            unsubscribe();
            unsubHistory();
            unsubChat();
            unsubLogs();
        };
    }, [gameDocRef, purchaseHistoryCollectionRef, chatCollectionRef, adminLogsCollectionRef]);

    useEffect(() => {
        const statusCollectionRef = db.collection('player_status');
        const usersCollectionRef = db.collection('users');
    
        const fetchOnlinePlayers = async () => {
            const thirtySecondsAgo = new Date(Date.now() - 30000);
            try {
                const statusSnapshot = await statusCollectionRef.where('lastSeen', '>', thirtySecondsAgo).get();
                
                setOnlinePlayersCount(statusSnapshot.size);
    
                if (statusSnapshot.empty) {
                    setAllOnlinePlayers([]);
                    return;
                }
    
                const onlineUserIds = statusSnapshot.docs.map(doc => doc.id);
                
                if (onlineUserIds.length === 0) {
                    setAllOnlinePlayers([]);
                    return;
                }
    
                const usersSnapshot = await usersCollectionRef.where(FieldPath.documentId(), 'in', onlineUserIds).get();
                
                const onlineUsersData = usersSnapshot.docs.map(doc => ({
                    uid: doc.id,
                    displayName: doc.data().displayName || 'Jogador Desconhecido',
                }));

                // FIX: Fetch card count from the source of truth (`player_cards`) instead of `gameState` to ensure consistency.
                const playersWithCardDataPromises = onlineUsersData.map(async (player) => {
                    const playerCardsRef = db.collection('player_cards').doc(player.uid).collection('cards').doc('active_game');
                    const playerCardsDoc = await playerCardsRef.get();
                    const cardCount = playerCardsDoc.exists ? (playerCardsDoc.data()?.cards?.length || 0) : 0;
                    return {
                        ...player,
                        cardCount: cardCount,
                    };
                });
    
                const playersWithCardData = await Promise.all(playersWithCardDataPromises);
                
                const sortedPlayers = playersWithCardData.sort((a, b) => b.cardCount - a.cardCount || a.displayName.localeCompare(b.displayName));
                
                setAllOnlinePlayers(sortedPlayers);
    
            } catch (err) {
                console.error("Error getting online players: ", err);
            }
        };
    
        fetchOnlinePlayers();
        const intervalId = setInterval(fetchOnlinePlayers, 10000);
    
        return () => clearInterval(intervalId);
    }, []);


    const filteredPurchaseHistory = useMemo(() => {
        if (!purchaseHistorySearch) return purchaseHistory;
        const lowercasedQuery = purchaseHistorySearch.toLowerCase();
        return purchaseHistory.filter(item =>
            item.playerName.toLowerCase().includes(lowercasedQuery)
        );
    }, [purchaseHistory, purchaseHistorySearch]);

    const filteredChatMessages = useMemo(() => {
        if (!chatSearch) return chatMessages;
        const lowercasedQuery = chatSearch.toLowerCase();
        return chatMessages.filter(msg =>
            msg.displayName.toLowerCase().includes(lowercasedQuery) ||
            msg.text.toLowerCase().includes(lowercasedQuery)
        );
    }, [chatMessages, chatSearch]);

    const filteredAdminLogs = useMemo(() => {
        if (!adminLogSearch) return adminLogs;
        const lowercasedQuery = adminLogSearch.toLowerCase();
        return adminLogs.filter(log =>
            log.adminName.toLowerCase().includes(lowercasedQuery) ||
            log.action.toLowerCase().includes(lowercasedQuery) ||
            (log.justification && log.justification.toLowerCase().includes(lowercasedQuery))
        );
    }, [adminLogs, adminLogSearch]);
    
    const handleDeleteChatMessage = async (message: ChatMessage) => {
        const adminUser = auth.currentUser;
        if (!adminUser) {
            showNotification('Administrador não autenticado. Por favor, faça login novamente.', 'error');
            return;
        }

        if (window.confirm(`Tem certeza de que deseja apagar a mensagem de "${message.displayName}"?\n\n"${message.text}"`)) {
            try {
                const batch = db.batch();
                const chatDocRef = db.collection('chat').doc(message.id);
                const adminLogRef = db.collection('admin_logs').doc();

                batch.delete(chatDocRef);

                batch.set(adminLogRef, {
                    adminUid: adminUser.uid,
                    adminName: adminUser.displayName || 'Admin',
                    action: 'delete_chat_message',
                    details: {
                        deletedMessageId: message.id,
                        deletedMessageText: message.text,
                        deletedMessageAuthorUid: message.uid,
                        deletedMessageAuthorName: message.displayName,
                    },
                    timestamp: serverTimestamp(),
                });

                await batch.commit();
                showNotification('Mensagem apagada com sucesso.', 'success');
            } catch (error) {
                console.error("Error deleting chat message:", error);
                showNotification('Falha ao apagar a mensagem.', 'error');
            }
        }
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
                setPlayerCardDetails(prev => ({ ...prev, [uid]: doc.exists ? (doc.data()?.cards as BingoCardData[] || []) : [] }));
            } catch (error) {
                console.error("Error fetching player cards:", error);
                showNotification('Falha ao carregar cartelas do jogador.', 'error');
            } finally {
                setIsLoadingCards(false);
            }
        }
    };

    const handleRemoveCard = async (playerId: string) => {
        if (!gameState || !gameState.players[playerId]) return;
    
        const justification = window.prompt(`Justifique a remoção da última cartela de ${gameState.players[playerId].displayName}:`);
        if (!justification || justification.trim() === '') {
            showNotification('A justificação é obrigatória.', 'error');
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
    
            showNotification('Cartela removida e jogador reembolsado.', 'success');
        } catch (error: any) {
            console.error("Erro ao remover cartela:", error);
            showNotification(error.message || 'Falha ao remover a cartela.', 'error');
        }
    };

    const handleSaveSettings = async () => {
        try {
            const settings = {
                lobbyCountdownDuration: Number(lobbyTime),
                drawIntervalDuration: Number(drawTime),
                endGameDelayDuration: Number(endTime),
            };
            await gameDocRef.update(settings);
            
            await db.collection('admin_logs').add({
                adminUid: user.uid,
                adminName: user.displayName,
                action: 'save_settings',
                details: settings,
                timestamp: serverTimestamp(),
            });

            showNotification('Configurações salvas com sucesso!', 'success');
        } catch (error) {
            console.error("Failed to save settings:", error);
            showNotification('Falha ao salvar configurações.', 'error');
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

    const handleForceStart = async () => {
        if (gameState?.status !== 'waiting') {
            showNotification('O jogo já começou ou não está em estado de espera.', 'error');
            return;
        }
        
        try {
            await gameDocRef.update({ status: 'running', countdown: gameState!.drawIntervalDuration || 5 });
            
            await db.collection('admin_logs').add({
                adminUid: user.uid,
                adminName: user.displayName,
                action: 'force_start_game',
                timestamp: serverTimestamp(),
            });

            showNotification('Jogo iniciado com sucesso!', 'success');
        } catch (error) {
            showNotification('Falha ao forçar o início do jogo.', 'error');
        }
    };
    
    const handleResetGame = async () => {
        if (window.confirm('Tem certeza que deseja resetar o jogo? Isso limpará todos os jogadores e cartelas da rodada atual, mas o histórico de compras será mantido.')) {
            if (!gameState) {
                showNotification('Estado do jogo não encontrado.', 'error');
                return;
            }
             try {
                const announcement = gameState.winners.length ? `Último(s) vencedor(es): ${gameState.winners.map(w => w.displayName).join(', ')}` : "Jogo resetado pelo administrador.";
                const batch = db.batch();
                const adminLogRef = db.collection('admin_logs').doc();

                // 1. Save game to history if it has ended
                if (gameState.status === 'ended' || gameState.status === 'running') {
                    const historyRef = db.collection('game_history').doc();
                    batch.set(historyRef, {
                        winners: gameState.winners,
                        drawnNumbers: gameState.drawnNumbers,
                        prizePool: gameState.prizePool,
                        completedAt: serverTimestamp()
                    });
                }
                
                // 2. Delete all active cards from participating players
                const playerIds = Object.keys(gameState.players || {});
                if (playerIds.length > 0) {
                    for (const uid of playerIds) {
                        const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                        batch.delete(playerCardsRef);
                    }
                }

                // 3. Reset the main game state document with a new round ID
                const newRoundId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                batch.update(gameDocRef, { 
                    status: 'waiting', 
                    drawnNumbers: [], 
                    prizePool: 0, 
                    winners: [], 
                    countdown: gameState.lobbyCountdownDuration || 15,
                    lastWinnerAnnouncement: announcement,
                    players: {},
                    pauseReason: '',
                    roundId: newRoundId,
                });

                // 4. Log the admin action
                batch.set(adminLogRef, {
                    adminUid: user.uid,
                    adminName: user.displayName,
                    action: 'reset_game',
                    timestamp: serverTimestamp(),
                });
                
                await batch.commit();
                showNotification('Jogo resetado com sucesso!', 'success');
            } catch (error) {
                showNotification('Falha ao resetar o jogo.', 'error');
                console.error(error);
            }
        }
    };

    const handleTogglePause = async () => {
        if (!gameState) return;
        const isPausing = gameState.status === 'running';
        const reason = isPausing ? window.prompt('Por favor, informe o motivo da pausa:', 'Pausa técnica') : '';

        if (isPausing && !reason) {
            return; // Don't pause if no reason is given
        }
        
        try {
            if (isPausing) {
                await gameDocRef.update({ status: 'paused', pauseReason: reason });
            } else { // is resuming from 'paused'
                await gameDocRef.update({ 
                    status: 'running', 
                    pauseReason: '', 
                    countdown: gameState.drawIntervalDuration || 5 
                });
            }
            
            await db.collection('admin_logs').add({
                adminUid: user.uid,
                adminName: user.displayName,
                action: isPausing ? 'pause_game' : 'resume_game',
                details: { reason: isPausing ? reason : null },
                timestamp: serverTimestamp(),
            });

            showNotification(`Jogo ${isPausing ? 'pausado' : 'retomado'} com sucesso.`, 'success');

        } catch (error) {
            showNotification(`Falha ao ${isPausing ? 'pausar' : 'retomar'} o jogo.`, 'error');
        }
    };
    
    const handleClearAllCardsClick = () => {
        if (!gameState || Object.keys(gameState.players).length === 0) {
            showNotification('Não há jogadores com cartelas para limpar.', 'error');
            return;
        }
    
        const isEmailProvider = user.providerData.some(p => p.providerId === 'password');
        if (!isEmailProvider) {
            showNotification('A verificação de senha só está disponível para administradores com login via e-mail/senha.', 'error');
            return;
        }
        setIsClearAllModalOpen(true);
    };

    const confirmAndExecuteClearAllCards = async (e: React.FormEvent) => {
        e.preventDefault();
        setClearAllError(null);
        setIsClearingCards(true);
    
        if (!clearAllPassword) {
            setClearAllError('A senha é obrigatória.');
            setIsClearingCards(false);
            return;
        }
        if (!clearAllJustification || clearAllJustification.trim() === '') {
            setClearAllError('A justificação é obrigatória.');
            setIsClearingCards(false);
            return;
        }
        if (!user.email || !auth.currentUser) {
            setClearAllError('Não foi possível verificar o e-mail do administrador.');
            setIsClearingCards(false);
            return;
        }
    
        try {
            const credential = EmailAuthProvider.credential(user.email, clearAllPassword);
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
                    justification: clearAllJustification,
                    timestamp: serverTimestamp(),
                });
            });
    
            showNotification('Todas as cartelas foram limpas e os jogadores reembolsados.', 'success');
            setIsClearAllModalOpen(false);
            setClearAllPassword('');
            setClearAllJustification('');
    
        } catch (err: any) {
            if (err.code === 'auth/wrong-password') {
                setClearAllError('Senha incorreta. Ação cancelada.');
            } else {
                console.error("Erro ao limpar todas as cartelas:", err);
                setClearAllError(err.message || 'Falha ao limpar as cartelas.');
            }
        } finally {
            setIsClearingCards(false);
        }
    };
    
    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Game Controls */}
                        <div className="bg-gray-900 p-4 rounded-lg">
                             <h3 className="text-xl font-semibold mb-4 text-center">Controles do Jogo</h3>
                             <div className="space-y-2">
                                <div className="flex gap-2">
                                    <button onClick={handleForceStart} disabled={gameState?.status !== 'waiting'} className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">Forçar Início</button>
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
                                    <button onClick={handleClearAllCardsClick} disabled={gameState?.status !== 'waiting' || totalPlayers === 0} className="flex-1 py-2 px-4 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">
                                        Limpar Todas as Cartelas
                                    </button>
                                </div>
                             </div>
                        </div>

                        {/* Time Settings */}
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
                );
            case 'players':
                return (
                    <div className="bg-gray-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-center">Gerenciamento de Jogadores ({allOnlinePlayers.length})</h3>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                            {allOnlinePlayers.length > 0 ? (
                                allOnlinePlayers.map(player => (
                                    <div key={player.uid} className="bg-gray-700 rounded-md transition-all duration-300">
                                        <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-600" onClick={() => handleTogglePlayer(player.uid)}>
                                            <div>
                                                <p className="font-semibold">{player.displayName}</p>
                                                <p className="text-sm text-gray-400">{player.cardCount} cartela(s)</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveCard(player.uid); }}
                                                    disabled={!player.cardCount || player.cardCount === 0 || gameState?.status !== 'waiting'}
                                                    className="py-1 px-3 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                                                >
                                                    Remover
                                                </button>
                                                <span className={`transform transition-transform text-gray-400 ${expandedPlayerId === player.uid ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                                            </div>
                                        </div>
                                        {expandedPlayerId === player.uid && (
                                            <div className="p-4 border-t border-gray-600 bg-gray-800">
                                                {isLoadingCards && <p className="text-sm text-center text-gray-400">Carregando...</p>}
                                                {!isLoadingCards && playerCardDetails[player.uid] && playerCardDetails[player.uid].length > 0 ? (() => {
                                                    const drawnNumbersSet = new Set(gameState?.drawnNumbers || []);
                                                    return (
                                                        <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                                                            {playerCardDetails[player.uid].map((card, index) => (
                                                                <div key={card?.id || index} className="bg-gray-900 p-3 rounded-lg">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <p className="text-base font-semibold text-purple-300">Cartela #{index + 1} <span className="text-xs text-gray-400 font-mono">(ID: {card?.id?.substring(0, 8) || 'Inválido'})</span></p>
                                                                         <button
                                                                            onClick={() => setSelectedCardModal(card)}
                                                                            className="p-1 text-gray-400 hover:text-white transition-colors"
                                                                            aria-label="Visualizar detalhes da cartela"
                                                                        >
                                                                            <EyeIcon className="w-5 h-5" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-5 gap-1.5 text-center text-base">
                                                                        {card.numbers.map((num, idx) => {
                                                                            const isDrawn = drawnNumbersSet.has(num);
                                                                            const isCenter = num === 0;
                                                                            
                                                                            let cellClasses = 'p-2 rounded-md aspect-square flex items-center justify-center font-bold';
    
                                                                            if (isCenter) {
                                                                                cellClasses += ' bg-yellow-500 text-black';
                                                                            } else if (isDrawn) {
                                                                                cellClasses += ' bg-green-500 text-white';
                                                                            } else {
                                                                                cellClasses += ' bg-gray-600 text-gray-300';
                                                                            }
                                                                            
                                                                            return (
                                                                                <div key={idx} className={cellClasses}>
                                                                                    {isCenter ? '★' : num}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })() : (
                                                    !isLoadingCards && <p className="text-sm text-center text-gray-500">Nenhuma cartela para exibir.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-400 italic">Nenhum jogador online.</p>
                            )}
                        </div>
                    </div>
                );
            case 'logs':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[600px] overflow-hidden">
                        {/* Purchase History */}
                        <div className="bg-gray-900 p-4 rounded-lg flex flex-col min-h-0">
                            <h3 className="text-xl font-semibold mb-2 text-center flex-shrink-0">Histórico de Vendas</h3>
                            <input
                                type="text"
                                placeholder="Buscar por jogador..."
                                value={purchaseHistorySearch}
                                onChange={(e) => setPurchaseHistorySearch(e.target.value)}
                                className="w-full p-2 mb-2 bg-gray-700 border border-gray-600 rounded-lg text-sm placeholder-gray-400"
                            />
                            <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                                {filteredPurchaseHistory.length > 0 ? (
                                    filteredPurchaseHistory.map(item => (
                                        <div key={item.id} className="bg-gray-700 p-2 rounded-md text-sm">
                                            <p className="font-semibold text-purple-300">{item.playerName}</p>
                                            {item.roundId && <p className="text-xs text-gray-400 font-mono">Rodada: {item.roundId.substring(0, 8)}</p>}
                                            <p className="text-xs text-gray-500 text-right">{item.timestamp ? new Date(item.timestamp.toDate()).toLocaleString('pt-BR') : '...'}</p>
                                        </div>
                                    ))
                                ) : (
                                     <p className="text-center text-gray-400 italic">
                                        {purchaseHistory.length === 0 ? 'Nenhuma cartela vendida.' : 'Nenhum resultado encontrado.'}
                                     </p>
                                )}
                            </div>
                        </div>
                        {/* Chat Moderation */}
                        <div className="bg-gray-900 p-4 rounded-lg flex flex-col min-h-0">
                            <h3 className="text-xl font-semibold mb-2 text-center flex-shrink-0">Moderação do Chat</h3>
                             <input
                                type="text"
                                placeholder="Buscar por jogador ou mensagem..."
                                value={chatSearch}
                                onChange={(e) => setChatSearch(e.target.value)}
                                className="w-full p-2 mb-2 bg-gray-700 border border-gray-600 rounded-lg text-sm placeholder-gray-400"
                            />
                            <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                                {filteredChatMessages.length > 0 ? (
                                    filteredChatMessages.map(msg => (
                                        <div key={msg.id} className="bg-gray-700 p-2 rounded-md text-sm flex items-start justify-between gap-2">
                                            <div className="flex-grow">
                                                <p className="font-semibold text-purple-300">{msg.displayName}</p>
                                                <p className="text-xs text-gray-400">{msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleString('pt-BR') : '...'}</p>
                                                <p className="text-white break-words mt-1">{msg.text}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteChatMessage(msg)}
                                                className="text-gray-500 hover:text-red-500 transition-colors p-1 rounded-full flex-shrink-0"
                                                aria-label="Excluir mensagem"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-gray-400 italic">
                                         {chatMessages.length === 0 ? 'Nenhuma mensagem no chat.' : 'Nenhum resultado encontrado.'}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Admin Logs */}
                         <div className="bg-gray-900 p-4 rounded-lg flex flex-col min-h-0">
                            <h3 className="text-xl font-semibold mb-2 text-center flex-shrink-0">Log de Ações do Administrador</h3>
                             <input
                                type="text"
                                placeholder="Buscar no log..."
                                value={adminLogSearch}
                                onChange={(e) => setAdminLogSearch(e.target.value)}
                                className="w-full p-2 mb-2 bg-gray-700 border border-gray-600 rounded-lg text-sm placeholder-gray-400"
                            />
                            <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                                {filteredAdminLogs.length > 0 ? (
                                    filteredAdminLogs.map(log => (
                                        <div key={log.id} className="bg-gray-700 p-2 rounded-md text-sm">
                                            <p className="font-semibold text-yellow-300">
                                                {log.adminName} <span className="text-gray-400 font-normal">({log.action})</span>
                                            </p>
                                            {log.justification && <p className="text-xs text-gray-300 italic">Justificativa: {log.justification}</p>}
                                            {log.details && <pre className="text-xs text-gray-400 bg-gray-800 p-1 rounded mt-1 whitespace-pre-wrap font-mono">{JSON.stringify(log.details, null, 2)}</pre>}
                                            <p className="text-xs text-gray-500 text-right">{log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString('pt-BR') : '...'}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-gray-400 italic">
                                         {adminLogs.length === 0 ? 'Nenhuma ação registrada.' : 'Nenhum resultado encontrado.'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };


    return (
        <div className="w-full max-w-7xl bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-bold">Painel de Administração</h2>
                    <div className="flex items-center gap-2 text-green-400">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span>AO VIVO</span>
                    </div>
                </div>
                <button onClick={onBack} className="text-gray-300 hover:text-white">&larr; Voltar para o Lobby</button>
            </div>

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
            
            {/* Tab Navigation */}
            <div className="border-b border-gray-700 mb-6">
                <nav className="flex space-x-2">
                    <TabButton isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                        Visão Geral & Controles
                    </TabButton>
                    <TabButton isActive={activeTab === 'players'} onClick={() => setActiveTab('players')}>
                        Gerenciamento de Jogadores
                    </TabButton>
                    <TabButton isActive={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
                        Logs & Moderação
                    </TabButton>
                </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {renderContent()}
            </div>

            {selectedCardModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md text-white border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-2xl font-bold text-purple-400">Detalhes da Cartela</h3>
                            <button onClick={() => setSelectedCardModal(null)} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4 font-mono">ID: {selectedCardModal.id}</p>
                        <div className="grid grid-cols-5 gap-4 text-center">
                            {['B', 'I', 'N', 'G', 'O'].map((letter, colIndex) => (
                                <div key={letter}>
                                    <h4 className="text-xl font-bold mb-2 text-purple-300">{letter}</h4>
                                    <div className="space-y-2">
                                        {Array.from({ length: 5 }).map((_, rowIndex) => {
                                            const num = selectedCardModal.numbers[rowIndex * 5 + colIndex];
                                            const isDrawn = gameState?.drawnNumbers.includes(num);
                                            const isCenter = num === 0;
                                            return (
                                                <div key={rowIndex} className={`p-2 rounded font-semibold ${isDrawn ? 'text-green-400' : ''} ${isCenter ? 'text-yellow-400' : ''}`}>
                                                    {isCenter ? 'GRÁTIS' : num}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setSelectedCardModal(null)} className="mt-6 w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold">
                            Fechar
                        </button>
                    </div>
                </div>
            )}
            {isClearAllModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-white border border-red-500">
                        <form onSubmit={confirmAndExecuteClearAllCards}>
                            <h3 className="text-2xl font-bold text-red-400 mb-4">Confirmar Limpeza de Todas as Cartelas</h3>
                            <p className="text-gray-300 mb-4">
                                Esta ação é <strong className="text-yellow-400">irreversível</strong>. Todas as cartelas da rodada atual serão removidas, o prêmio será zerado e os jogadores serão reembolsados.
                            </p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="admin-password-confirm" className="block text-sm font-medium text-gray-300 mb-1">Sua Senha de Administrador</label>
                                    <input
                                        id="admin-password-confirm"
                                        type="password"
                                        value={clearAllPassword}
                                        onChange={(e) => setClearAllPassword(e.target.value)}
                                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="admin-justification" className="block text-sm font-medium text-gray-300 mb-1">Justificação (Obrigatório)</label>
                                    <textarea
                                        id="admin-justification"
                                        value={clearAllJustification}
                                        onChange={(e) => setClearAllJustification(e.target.value)}
                                        rows={3}
                                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
                                        required
                                    />
                                </div>
                            </div>

                            {clearAllError && <p className="mt-4 text-center text-red-400 bg-red-900 bg-opacity-50 p-2 rounded-lg">{clearAllError}</p>}

                            <div className="mt-6 flex justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsClearAllModalOpen(false);
                                        setClearAllError(null);
                                        setClearAllPassword('');
                                        setClearAllJustification('');
                                    }}
                                    className="py-2 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold"
                                    disabled={isClearingCards}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="py-2 px-6 bg-red-700 hover:bg-red-800 rounded-lg font-bold disabled:bg-red-900 disabled:cursor-not-allowed flex items-center"
                                    disabled={isClearingCards}
                                >
                                    {isClearingCards ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Limpando...
                                        </>
                                    ) : 'Confirmar e Limpar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};