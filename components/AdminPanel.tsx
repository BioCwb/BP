import React, { useState, useEffect, useMemo } from 'react';
import firebase from 'firebase/compat/app';
import { db, serverTimestamp, increment, auth, EmailAuthProvider } from '../firebase/config';
import type { GameState } from './BingoGame';
import { TrashIcon } from './icons/TrashIcon';
import { EyeIcon } from './icons/EyeIcon';
import { calculateCardProgress } from '../utils/bingoUtils';

// TODO: This should ideally be managed via roles in Firestore Security Rules or a central config.
const ADMIN_UID = 'fKlSv57pZeSGPGiQG2z4NKAD9qi2';

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


export const AdminPanel: React.FC<AdminPanelProps> = ({ user, onBack }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
    const [totalPlayerFichas, setTotalPlayerFichas] = useState(0);
    const [lobbyTime, setLobbyTime] = useState(30);
    const [drawTime, setDrawTime] = useState(8);
    const [endTime, setEndTime] = useState(15);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
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

    // State for bonus configuration
    const [welcomeBonus, setWelcomeBonus] = useState(100);
    const [dailyBonus, setDailyBonus] = useState(10);
    
    // State for managing player fichas modal
    const [isManageFichasModalOpen, setIsManageFichasModalOpen] = useState(false);
    const [selectedPlayerForFichas, setSelectedPlayerForFichas] = useState<{ uid: string; displayName: string } | null>(null);
    const [fichasAmount, setFichasAmount] = useState<number | string>('');
    const [fichasAction, setFichasAction] = useState<'give' | 'remove'>('give');
    const [fichasJustification, setFichasJustification] = useState('');
    const [fichasError, setFichasError] = useState<string | null>(null);
    const [isProcessingFichas, setIsProcessingFichas] = useState(false);
    
    // State for "Clear All Cards" modal
    const [isClearCardsModalOpen, setIsClearCardsModalOpen] = useState(false);
    const [clearCardsJustification, setClearCardsJustification] = useState('');
    const [clearCardsConfirmationText, setClearCardsConfirmationText] = useState('');
    const [clearCardsError, setClearCardsError] = useState<string | null>(null);
    const [isClearingCards, setIsClearingCards] = useState(false);


    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);
    const purchaseHistoryCollectionRef = useMemo(() => db.collection('purchase_history'), []);
    const chatCollectionRef = useMemo(() => db.collection('chat'), []);
    const adminLogsCollectionRef = useMemo(() => db.collection('admin_logs'), []);
    const bonusConfigRef = useMemo(() => db.collection('game_config').doc('bonuses'), []);


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
        
        const unsubBonusConfig = bonusConfigRef.onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                setWelcomeBonus(data?.welcomeBonus || 100);
                setDailyBonus(data?.dailyBonus || 10);
            }
        });

        return () => { 
            unsubscribe();
            unsubHistory();
            unsubChat();
            unsubLogs();
            unsubBonusConfig();
        };
    }, [gameDocRef, purchaseHistoryCollectionRef, chatCollectionRef, adminLogsCollectionRef, bonusConfigRef]);

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
    
    // Effect to calculate and listen for changes in the total fichas of all players in the game.
    useEffect(() => {
        // Guard against running when there are no players
        if (!gameState?.players || Object.keys(gameState.players).length === 0) {
            setTotalPlayerFichas(0);
            return;
        }

        const playerIds = Object.keys(gameState.players);
        
        // Firestore 'in' query has a limit (30 for onSnapshot), which is fine for this game's scale.
        if (playerIds.length === 0) {
            setTotalPlayerFichas(0);
            return;
        }

        const unsubscribe = db.collection('users')
            .where(firebase.firestore.FieldPath.documentId(), 'in', playerIds)
            .onSnapshot(snapshot => {
                let total = 0;
                snapshot.forEach(doc => {
                    // Safely access 'fichas' property
                    total += doc.data()?.fichas || 0;
                });
                setTotalPlayerFichas(total);
            }, err => {
                console.error("Error fetching total player fichas:", err);
                showMessage('error', 'Falha ao carregar o total de fichas dos jogadores.');
                setTotalPlayerFichas(0); // Reset on error
            });

        return () => unsubscribe(); // Cleanup listener on component unmount or when players change
    }, [gameState?.players]);

    // Main Game Loop - controlled by the Admin Panel
    useEffect(() => {
        if (user.uid !== ADMIN_UID || !gameState) return;

        if (gameState.status === 'running') {
            const drawInterval = (gameState.drawIntervalDuration || 8) * 1000;

            const gameLoop = setTimeout(async () => {
                try {
                    await db.runTransaction(async (transaction) => {
                        const gameDocInTransaction = await transaction.get(gameDocRef);
                        if (!gameDocInTransaction.exists) throw new Error("O jogo não foi encontrado.");
                        
                        const currentGameState = gameDocInTransaction.data() as GameState;
                        if (currentGameState.status !== 'running') return; // Stop if game state changed

                        const availableNumbers = Array.from({ length: 60 }, (_, i) => i + 1)
                            .filter(num => !currentGameState.drawnNumbers.includes(num));

                        if (availableNumbers.length === 0) {
                            transaction.update(gameDocRef, { status: 'ended', winners: [] });
                            return;
                        }

                        const newNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
                        const updatedDrawnNumbers = [...currentGameState.drawnNumbers, newNumber];
                        
                        const playerIds = Object.keys(currentGameState.players || {});
                        const winners: { uid: string, displayName: string, card: number[] }[] = [];
                        const updatedPlayers = { ...currentGameState.players };

                        for (const uid of playerIds) {
                            const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                            const playerCardsDoc = await transaction.get(playerCardsRef);
                            
                            if (playerCardsDoc.exists) {
                                const cards = playerCardsDoc.data()!.cards as BingoCardData[];
                                let minProgress = 24;

                                for (const card of cards) {
                                    const { isBingo, numbersToWin } = calculateCardProgress(card.numbers, updatedDrawnNumbers);
                                    if (numbersToWin < minProgress) minProgress = numbersToWin;
                                    if (isBingo) {
                                        winners.push({ uid, displayName: currentGameState.players[uid].displayName, card: card.numbers });
                                    }
                                }
                                updatedPlayers[uid] = { ...updatedPlayers[uid], progress: minProgress };
                            }
                        }

                        if (winners.length > 0) {
                            const prizePerWinner = Math.floor(currentGameState.prizePool / winners.length);
                            for (const winner of winners) {
                                const userRef = db.collection('users').doc(winner.uid);
                                transaction.update(userRef, { fichas: increment(prizePerWinner) });
                            }
                            transaction.update(gameDocRef, {
                                status: 'ended',
                                drawnNumbers: updatedDrawnNumbers,
                                winners: winners,
                                players: updatedPlayers
                            });
                        } else {
                            transaction.update(gameDocRef, {
                                drawnNumbers: updatedDrawnNumbers,
                                countdown: currentGameState.drawIntervalDuration || 8,
                                players: updatedPlayers
                            });
                        }
                    });
                } catch (error) {
                    console.error("Erro na transação do ciclo do jogo:", error);
                    showMessage('error', 'Erro na transação de verificação do vencedor.');
                    await gameDocRef.update({ status: 'paused', pauseReason: 'Erro crítico no servidor.' });
                }
            }, drawInterval);

            const countdownTimer = setInterval(() => {
                gameDocRef.update({ countdown: increment(-1) }).catch(() => {});
            }, 1000);

            return () => {
                clearTimeout(gameLoop);
                clearInterval(countdownTimer);
            };
        }
    }, [gameState, user.uid, gameDocRef]);


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
    
    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };
    
    const handleDeleteChatMessage = async (message: ChatMessage) => {
        const adminUser = auth.currentUser;
        if (!adminUser) {
            showMessage('error', 'Administrador não autenticado. Por favor, faça login novamente.');
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
                showMessage('success', 'Mensagem apagada com sucesso.');
            } catch (error) {
                console.error("Error deleting chat message:", error);
                showMessage('error', 'Falha ao apagar a mensagem.');
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

            showMessage('success', 'Configurações salvas com sucesso!');
        } catch (error) {
            console.error("Failed to save settings:", error);
            showMessage('error', 'Falha ao salvar configurações.');
        }
    };
    
    const handleSaveBonuses = async () => {
        try {
            const bonusData = {
                welcomeBonus: Number(welcomeBonus),
                dailyBonus: Number(dailyBonus),
            };
            await bonusConfigRef.set(bonusData, { merge: true });

            await db.collection('admin_logs').add({
                adminUid: user.uid,
                adminName: user.displayName,
                action: 'save_bonus_settings',
                details: bonusData,
                timestamp: serverTimestamp(),
            });

            showMessage('success', 'Configurações de bônus salvas com sucesso!');
        } catch (error) {
            console.error("Failed to save bonus settings:", error);
            showMessage('error', 'Falha ao salvar configurações de bônus.');
        }
    };
    
    const openManageFichasModal = (uid: string, displayName: string) => {
        setSelectedPlayerForFichas({ uid, displayName });
        setFichasAction('give');
        setFichasAmount('');
        setFichasJustification('');
        setFichasError(null);
        setIsManageFichasModalOpen(true);
    };

    const handleManageFichasSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFichasError(null);

        if (!selectedPlayerForFichas || !fichasAmount || Number(fichasAmount) <= 0) {
            setFichasError('Por favor, insira um valor de fichas válido.');
            return;
        }
        if (fichasAction === 'remove' && !fichasJustification.trim()) {
            setFichasError('A justificação é obrigatória para remover fichas.');
            return;
        }

        setIsProcessingFichas(true);
        try {
            const amount = Number(fichasAmount);
            const userDocRef = db.collection('users').doc(selectedPlayerForFichas.uid);
            const adminLogRef = db.collection('admin_logs').doc();

            const batch = db.batch();

            batch.update(userDocRef, {
                fichas: increment(fichasAction === 'give' ? amount : -amount)
            });

            batch.set(adminLogRef, {
                adminUid: user.uid,
                adminName: user.displayName || 'Admin',
                action: fichasAction === 'give' ? 'give_fichas' : 'remove_fichas',
                details: {
                    targetUid: selectedPlayerForFichas.uid,
                    targetName: selectedPlayerForFichas.displayName,
                    amount: amount
                },
                justification: fichasAction === 'remove' ? fichasJustification : null,
                timestamp: serverTimestamp(),
            });

            await batch.commit();
            showMessage('success', `Fichas ${fichasAction === 'give' ? 'dadas' : 'removidas'} com sucesso!`);
            setIsManageFichasModalOpen(false);

        } catch (error) {
            console.error("Error managing fichas:", error);
            setFichasError('Falha ao atualizar as fichas do jogador.');
        } finally {
            setIsProcessingFichas(false);
        }
    };
    
    const handleForceStart = async () => {
        const adminUser = auth.currentUser;
        if (!adminUser || !gameState) return;
    
        const playerCount = Object.keys(gameState.players || {}).length;
        const prizePool = gameState.prizePool || 0;
    
        if (playerCount < 2 || prizePool === 0) {
            let confirmationMessage = "Atenção:\n\n";
            if (playerCount < 2) {
                confirmationMessage += `- Há menos de 2 jogadores na partida.\n`;
            }
            if (prizePool === 0) {
                confirmationMessage += `- O prêmio acumulado é 0 F.\n`;
            }
            confirmationMessage += "\nDeseja mesmo assim forçar o início do jogo?";
    
            if (!window.confirm(confirmationMessage)) {
                return; // Admin cancelled the action
            }
        }
    
        try {
            await gameDocRef.update({
                status: 'running',
                host: adminUser.uid,
                countdown: gameState.drawIntervalDuration,
            });
    
            const justification = (playerCount < 2 || prizePool === 0) 
                ? `Início forçado com ${playerCount} jogadores e prêmio de ${prizePool} F.` 
                : null;
    
            await db.collection('admin_logs').add({
                adminUid: adminUser.uid,
                adminName: user.displayName,
                action: 'force_start_game',
                details: {
                    playerCountAtStart: playerCount,
                    prizePoolAtStart: prizePool,
                },
                justification: justification,
                timestamp: serverTimestamp(),
            });
    
            showMessage('success', 'Jogo iniciado com força!');
        } catch (error) {
            console.error("Error forcing game start:", error);
            showMessage('error', 'Falha ao forçar o início do jogo.');
        }
    };

    const handleResetGame = async () => {
        const adminUser = auth.currentUser;
        if (!adminUser || !gameState) return;

        if (window.confirm('Tem certeza que deseja resetar o jogo? Esta ação não pode ser desfeita.')) {
            try {
                const batch = db.batch();
                
                const announcement = gameState.winners.length > 0
                    ? `Último(s) vencedor(es): ${gameState.winners.map(w => w.displayName).join(', ')}`
                    : "Jogo resetado pelo administrador.";

                batch.update(gameDocRef, {
                    status: 'waiting',
                    drawnNumbers: [],
                    prizePool: 0,
                    winners: [],
                    countdown: gameState.lobbyCountdownDuration,
                    lastWinnerAnnouncement: announcement,
                    players: {},
                    pauseReason: ''
                });

                const playerIds = Object.keys(gameState.players || {});
                for (const uid of playerIds) {
                    const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                    batch.delete(playerCardsRef);
                }
                
                const purchaseHistoryCollectionRef = db.collection('purchase_history');
                const purchaseHistorySnapshot = await purchaseHistoryCollectionRef.get();
                purchaseHistorySnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });

                const adminLogRef = db.collection('admin_logs').doc();
                batch.set(adminLogRef, {
                    adminUid: adminUser.uid,
                    adminName: adminUser.displayName,
                    action: 'reset_game',
                    timestamp: serverTimestamp(),
                });

                await batch.commit();
                showMessage('success', 'Jogo resetado com sucesso.');

            } catch (error) {
                console.error("Error resetting game:", error);
                showMessage('error', 'Falha ao resetar o jogo.');
            }
        }
    };
    
    const handleConfirmClearAllCards = async (e: React.FormEvent) => {
        e.preventDefault();
        setClearCardsError(null);

        if (!clearCardsJustification.trim()) {
            setClearCardsError('A justificação é obrigatória para esta ação.');
            return;
        }

        const adminUser = auth.currentUser;
        if (!adminUser || !gameState) {
            setClearCardsError('Administrador ou estado do jogo não encontrado.');
            return;
        }
        
        setIsClearingCards(true);

        try {
            const batch = db.batch();
            const playerIds = Object.keys(gameState.players || {});
            
            if (playerIds.length === 0) {
                throw new Error("Nenhum jogador com cartelas para limpar.");
            }

            for (const uid of playerIds) {
                const player = gameState.players[uid];
                const cardCount = player.cardCount || 0;
                
                if (cardCount > 0) {
                    const refundAmount = cardCount * 10;
                    const userRef = db.collection('users').doc(uid);
                    batch.update(userRef, { fichas: increment(refundAmount) });
                }
                
                const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                batch.delete(playerCardsRef);
            }
            
            const purchaseHistoryCollectionRef = db.collection('purchase_history');
            const purchaseHistorySnapshot = await purchaseHistoryCollectionRef.get();
            purchaseHistorySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            batch.update(gameDocRef, {
                prizePool: 0,
                players: {},
            });

            const adminLogRef = db.collection('admin_logs').doc();
            batch.set(adminLogRef, {
                adminUid: adminUser.uid,
                adminName: adminUser.displayName,
                action: 'clear_all_cards',
                justification: clearCardsJustification,
                timestamp: serverTimestamp(),
            });

            await batch.commit();
            
            showMessage('success', 'Todas as cartelas foram limpas e os jogadores reembolsados.');
            setIsClearCardsModalOpen(false);
            setClearCardsJustification('');
            setClearCardsConfirmationText('');

        } catch (error: any) {
            console.error("Error clearing all cards:", error);
            setClearCardsError(error.message || 'Falha ao limpar as cartelas.');
        } finally {
            setIsClearingCards(false);
        }
    };

    const handlePauseGame = async () => {
        const adminUser = auth.currentUser;
        if (!adminUser || !gameState) return;

        const reason = window.prompt("Digite o motivo da pausa (opcional):");
        try {
            await gameDocRef.update({
                status: 'paused',
                pauseReason: reason || 'Pausado pelo administrador',
            });
            await db.collection('admin_logs').add({
                adminUid: adminUser.uid,
                adminName: adminUser.displayName,
                action: 'pause_game',
                justification: reason,
                timestamp: serverTimestamp(),
            });
            showMessage('success', 'Jogo pausado.');
        } catch (error) {
            console.error("Error pausing game:", error);
            showMessage('error', 'Falha ao pausar o jogo.');
        }
    };
    
    const handleResumeGame = async () => {
        const adminUser = auth.currentUser;
        if (!adminUser) return;
        try {
            await gameDocRef.update({
                status: 'running',
                pauseReason: '',
            });
            await db.collection('admin_logs').add({
                adminUid: adminUser.uid,
                adminName: adminUser.displayName,
                action: 'resume_game',
                timestamp: serverTimestamp(),
            });
            showMessage('success', 'Jogo retomado.');
        } catch (error) {
            console.error("Error resuming game:", error);
            showMessage('error', 'Falha ao retomar o jogo.');
        }
    };
    
    const sortedPlayers = useMemo(() => {
        if (!gameState || !gameState.players) return [];
        return (Object.entries(gameState.players) as [string, { displayName: string, cardCount: number, progress?: number }][])
            .sort(([, a], [, b]) => (a.progress ?? 99) - (b.progress ?? 99));
    }, [gameState]);


    if (user.uid !== ADMIN_UID) {
        return (
            <div className="text-center p-8">
                <h2 className="text-2xl text-red-500">Acesso Negado</h2>
                <p>Você não tem permissão para visualizar esta página.</p>
                <button onClick={onBack} className="mt-4 py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg">Voltar para o Lobby</button>
            </div>
        );
    }
    
    if (!gameState) {
        return <div className="text-center text-xl">Carregando Painel do Admin...</div>;
    }

    const renderStatCard = (title: string, value: string | number, colorClass: string) => (
        <div className={`p-4 rounded-lg shadow-md bg-gray-800 ${colorClass}`}>
            <h3 className="text-sm font-semibold text-gray-300 uppercase">{title}</h3>
            <p className="text-3xl font-bold">{value}</p>
        </div>
    );
    
    return (
        <div className="bg-gray-900 text-white w-full max-w-7xl mx-auto p-4 rounded-lg shadow-2xl">
            {message && (
                <div className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg z-50 ${message.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {message.text}
                </div>
            )}
            {selectedCardModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setSelectedCardModal(null)}>
                    <div className="bg-gray-800 p-4 rounded-lg" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-center font-bold mb-2">Cartela</h3>
                         <div className="grid grid-cols-5 gap-1">
                            {selectedCardModal.numbers.map((num, index) => (
                                <div key={index} className={`w-12 h-12 flex items-center justify-center font-bold rounded ${gameState.drawnNumbers.includes(num) ? 'bg-green-500' : 'bg-gray-600'}`}>
                                    {index === 12 ? '★' : num}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {isManageFichasModalOpen && selectedPlayerForFichas && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg shadow-2xl w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-4">Gerenciar Fichas de {selectedPlayerForFichas.displayName}</h2>
                        <form onSubmit={handleManageFichasSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Ação</label>
                                <select value={fichasAction} onChange={(e) => setFichasAction(e.target.value as 'give' | 'remove')} className="w-full py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg">
                                    <option value="give">Dar Fichas</option>
                                    <option value="remove">Remover Fichas</option>
                                </select>
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Quantidade</label>
                                <input type="number" value={fichasAmount} onChange={(e) => setFichasAmount(e.target.value)} min="1" className="w-full py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg" placeholder="Ex: 50" />
                            </div>
                            {fichasAction === 'remove' && (
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Justificação (Obrigatória)</label>
                                    <textarea value={fichasJustification} onChange={(e) => setFichasJustification(e.target.value)} rows={3} className="w-full py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg" placeholder="Ex: Abuso de comportamento"></textarea>
                                </div>
                            )}
                            {fichasError && <p className="text-red-400 mb-4">{fichasError}</p>}
                            <div className="flex justify-end gap-4">
                                <button type="button" onClick={() => setIsManageFichasModalOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={isProcessingFichas} className="py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg disabled:bg-gray-500">
                                    {isProcessingFichas ? 'Processando...' : 'Confirmar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {isClearCardsModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 p-6 rounded-lg shadow-2xl w-full max-w-md border-2 border-red-500">
                        <div className="flex items-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <h2 className="text-2xl font-bold text-red-400">Confirmar Ação Crítica</h2>
                        </div>
                        <p className="text-gray-300 mb-4">
                            Esta ação irá <strong className="text-yellow-400">remover TODAS as cartelas de TODOS os jogadores</strong> e reembolsá-los integralmente. 
                            O prêmio acumulado será zerado. Esta ação é <strong className="text-red-500 uppercase">irreversível</strong>.
                        </p>
                        <form onSubmit={handleConfirmClearAllCards}>
                            <div className="mb-4">
                                <label htmlFor="clear-justification" className="block text-sm font-medium text-gray-300 mb-1">Justificação (Obrigatória)</label>
                                <textarea 
                                    id="clear-justification"
                                    value={clearCardsJustification} 
                                    onChange={(e) => setClearCardsJustification(e.target.value)} 
                                    rows={3} 
                                    className="w-full py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500" 
                                    placeholder="Ex: Fim do evento, reset da rodada."
                                />
                            </div>
                            <div className="mb-4 bg-gray-900 p-4 rounded-lg border border-yellow-600">
                                <label htmlFor="clear-confirmation-text" className="block text-sm font-medium text-gray-300 mb-2 text-center">
                                    Para confirmar, digite <strong className="text-yellow-400 tracking-widest">CONFIRMAR</strong> no campo abaixo.
                                </label>
                                <input
                                    id="clear-confirmation-text"
                                    type="text"
                                    value={clearCardsConfirmationText}
                                    onChange={(e) => setClearCardsConfirmationText(e.target.value)}
                                    className="w-full py-2 px-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 text-center uppercase"
                                />
                            </div>
                            {clearCardsError && <p className="text-red-400 mb-4">{clearCardsError}</p>}
                            <div className="flex justify-end gap-4">
                                <button type="button" onClick={() => setIsClearCardsModalOpen(false)} className="py-2 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg">Cancelar</button>
                                <button 
                                    type="submit" 
                                    disabled={isClearingCards || clearCardsConfirmationText !== 'CONFIRMAR' || !clearCardsJustification.trim()} 
                                    className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
                                >
                                    {isClearingCards ? 'Limpando...' : 'Confirmar e Limpar Tudo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <header className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-purple-400">Painel do Administrador</h1>
                <button onClick={onBack} className="py-2 px-4 bg-gray-700 hover:bg-gray-800 rounded-lg font-semibold">&larr; Voltar para o Lobby</button>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {renderStatCard('Status do Jogo', gameState.status.toUpperCase(), 'border-l-4 border-blue-500')}
                {renderStatCard('Jogadores Online', onlinePlayersCount, 'border-l-4 border-green-500')}
                {renderStatCard('Jogadores na Partida', Object.keys(gameState.players).length, 'border-l-4 border-teal-500')}
                {renderStatCard('Fichas em Jogo', totalPlayerFichas, 'border-l-4 border-pink-500')}
                {renderStatCard('Prêmio Acumulado', `${gameState.prizePool} F`, 'border-l-4 border-yellow-500')}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Coluna 1: Controles e Configurações */}
                <div className="bg-gray-800 p-4 rounded-lg space-y-6">
                    <div>
                        <h2 className="text-xl font-bold mb-2">Controles do Jogo</h2>
                         <div className="space-y-2">
                             <button onClick={handleForceStart} disabled={gameState.status !== 'waiting'} className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg disabled:bg-gray-500">Forçar Início</button>
                             <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleResetGame} className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg">Resetar Jogo</button>
                                <button 
                                    onClick={() => {
                                        setClearCardsJustification('');
                                        setClearCardsError(null);
                                        setClearCardsConfirmationText('');
                                        setIsClearCardsModalOpen(true);
                                    }} 
                                    disabled={gameState.status !== 'waiting' || isClearingCards} 
                                    className={`w-full py-2 px-4 rounded-lg ${gameState.status === 'waiting' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'bg-gray-600' } disabled:bg-gray-500 disabled:cursor-not-allowed`}
                                >
                                    Limpar Todas as Cartelas
                                </button>
                             </div>
                             {gameState.status === 'running' && <button onClick={handlePauseGame} className="w-full py-2 px-4 bg-yellow-500 text-black hover:bg-yellow-600 rounded-lg">Pausar Jogo</button>}
                             {gameState.status === 'paused' && <button onClick={handleResumeGame} className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 rounded-lg">Retomar Jogo</button>}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-2">Configurações de Tempo (segundos)</h2>
                        <div className="space-y-2">
                            <div>
                                <label className="block text-sm">Tempo de Lobby</label>
                                <input type="number" value={lobbyTime} onChange={e => setLobbyTime(Number(e.target.value))} className="w-full p-2 bg-gray-700 rounded" />
                            </div>
                            <div>
                                <label className="block text-sm">Intervalo do Sorteio</label>
                                <input type="number" value={drawTime} onChange={e => setDrawTime(Number(e.target.value))} className="w-full p-2 bg-gray-700 rounded" />
                            </div>
                            <div>
                                <label className="block text-sm">Tempo Final do Jogo</label>
                                <input type="number" value={endTime} onChange={e => setEndTime(Number(e.target.value))} className="w-full p-2 bg-gray-700 rounded" />
                            </div>
                            <button onClick={handleSaveSettings} className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg">Salvar Configurações</button>
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-2">Configurações de Bônus (Fichas)</h2>
                        <div className="space-y-2">
                            <div>
                                <label className="block text-sm">Bônus de Boas-Vindas</label>
                                <input type="number" value={welcomeBonus} onChange={e => setWelcomeBonus(Number(e.target.value))} className="w-full p-2 bg-gray-700 rounded" />
                            </div>
                            <div>
                                <label className="block text-sm">Bônus Diário</label>
                                <input type="number" value={dailyBonus} onChange={e => setDailyBonus(Number(e.target.value))} className="w-full p-2 bg-gray-700 rounded" />
                            </div>
                             <button onClick={handleSaveBonuses} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg">Salvar Bônus</button>
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Gerenciamento de Jogadores */}
                 <div className="bg-gray-800 p-4 rounded-lg flex flex-col">
                    <h2 className="text-xl font-bold mb-4 flex-shrink-0">Jogadores na Partida ({sortedPlayers.length})</h2>
                    <div className="overflow-y-auto flex-grow">
                        {sortedPlayers.length > 0 ? (
                            <ul className="space-y-2 pr-2">
                                {sortedPlayers.map(([uid, player]) => (
                                    <li key={uid} className="bg-gray-700 p-2 rounded-lg">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold">{player.displayName}</p>
                                                <p className="text-xs text-gray-400">Cartelas: {player.cardCount || 0} | Faltam: {player.progress ?? '-'}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => openManageFichasModal(uid, player.displayName)} className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs">Gerenciar Fichas</button>
                                                <button onClick={() => handleRemoveCard(uid)} className="p-1.5 bg-red-600 hover:bg-red-700 rounded"><TrashIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleTogglePlayer(uid)} className="p-1.5 bg-gray-600 hover:bg-gray-500 rounded"><EyeIcon className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                        {expandedPlayerId === uid && (
                                            <div className="mt-2 pt-2 border-t border-gray-600">
                                                {isLoadingCards ? <p>Carregando...</p> : (
                                                    playerCardDetails[uid] && playerCardDetails[uid].length > 0 ? (
                                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                                            {playerCardDetails[uid].map(card => (
                                                                <div key={card.id} className="bg-gray-800 p-1 rounded text-center">
                                                                    <p>ID: ...{card.id.slice(-4)}</p>
                                                                    <button onClick={() => setSelectedCardModal(card)} className="text-purple-400 hover:underline text-xs">Ver Cartela</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : <p>Nenhuma cartela ativa.</p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                             <p className="text-gray-400 text-center italic mt-4">Nenhum jogador na partida.</p>
                        )}
                    </div>
                </div>

                {/* Coluna 3: Logs e Históricos */}
                 <div className="bg-gray-800 p-4 rounded-lg flex flex-col space-y-4">
                     <div className="flex-grow flex flex-col min-h-0">
                        <h2 className="text-xl font-bold mb-2 flex-shrink-0">Histórico de Compras</h2>
                        <input type="text" placeholder="Buscar por jogador..." value={purchaseHistorySearch} onChange={e => setPurchaseHistorySearch(e.target.value)} className="w-full p-2 mb-2 bg-gray-700 rounded flex-shrink-0"/>
                        <div className="overflow-y-auto flex-grow text-sm pr-2">
                             {filteredPurchaseHistory.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded mb-1">
                                    <p><span className="font-semibold">{item.playerName}</span> comprou a cartela ...{item.cardId.slice(-4)}</p>
                                    <p className="text-xs text-gray-400">{item.timestamp?.toDate().toLocaleTimeString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                     <div className="flex-grow flex flex-col min-h-0">
                        <h2 className="text-xl font-bold mb-2 flex-shrink-0">Chat do Lobby</h2>
                         <input type="text" placeholder="Buscar no chat..." value={chatSearch} onChange={e => setChatSearch(e.target.value)} className="w-full p-2 mb-2 bg-gray-700 rounded flex-shrink-0"/>
                        <div className="overflow-y-auto flex-grow text-sm pr-2">
                            {filteredChatMessages.map(msg => (
                                <div key={msg.id} className="bg-gray-700 p-2 rounded mb-1 flex justify-between items-start">
                                    <div>
                                        <p><span className="font-semibold text-blue-300">{msg.displayName}:</span> {msg.text}</p>
                                        <p className="text-xs text-gray-400">{msg.timestamp?.toDate().toLocaleTimeString()}</p>
                                    </div>
                                    <button onClick={() => handleDeleteChatMessage(msg)} className="ml-2 p-1 bg-red-600 hover:bg-red-700 rounded-full flex-shrink-0"><TrashIcon className="w-3 h-3" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                     <div className="flex-grow flex flex-col min-h-0">
                        <h2 className="text-xl font-bold mb-2 flex-shrink-0">Logs do Admin</h2>
                        <input type="text" placeholder="Buscar nos logs..." value={adminLogSearch} onChange={e => setAdminLogSearch(e.target.value)} className="w-full p-2 mb-2 bg-gray-700 rounded flex-shrink-0"/>
                        <div className="overflow-y-auto flex-grow text-sm pr-2">
                             {filteredAdminLogs.map(log => (
                                <div key={log.id} className="bg-gray-700 p-2 rounded mb-1">
                                    <p><span className="font-semibold text-yellow-300">{log.adminName}</span>: <span className="text-purple-300">{log.action}</span></p>
                                     {log.justification && <p className="text-xs italic text-gray-400">Justificação: {log.justification}</p>}
                                    <p className="text-xs text-gray-400">{log.timestamp?.toDate().toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};