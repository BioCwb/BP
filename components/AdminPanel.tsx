import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type firebase from 'firebase/compat/app';
import { db, serverTimestamp, increment, auth, EmailAuthProvider } from '../firebase/config';
import type { GameState } from './BingoGame';
import { TrashIcon } from './icons/TrashIcon';
import { EyeIcon } from './icons/EyeIcon';
import { useNotification } from '../context/NotificationContext';
import { BingoMasterBoard } from './BingoMasterBoard';
import { calculateCardProgress } from '../utils/bingoUtils';
import { EditIcon } from './icons/EditIcon';
import { KeyIcon } from './icons/KeyIcon';

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

interface ManagedUser {
    uid: string;
    displayName: string;
    email: string;
    fichas: number;
    pixKeyType?: string;
    pixKey?: string;
    fullName?: string;
}

interface PixConfig {
    key: string;
    name: string;
    city: string;
    whatsapp: string;
}

interface PixHistoryItem {
    id: string;
    targetUid: string;
    targetName: string;
    adminUid: string;
    adminName: string;
    fichasAmount: number;
    brlAmount: number;
    timestamp: firebase.firestore.Timestamp;
}

type AdminTab = 'overview' | 'users' | 'pixHistory' | 'logs' | 'settings';
const USERS_PER_PAGE = 10;


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
    const [selectedCardModal, setSelectedCardModal] = useState<{ card: BingoCardData; ownerId: string; ownerName: string; } | null>(null);
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const isGameLoopRunning = useRef(false);
    const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState === 'visible');
    const [pixConfig, setPixConfig] = useState<PixConfig>({ key: '', name: '', city: '', whatsapp: '' });
    const [isLoadingPixConfig, setIsLoadingPixConfig] = useState(true);

    const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userPage, setUserPage] = useState(1);
    const [lastUserDoc, setLastUserDoc] = useState<firebase.firestore.DocumentSnapshot | null>(null);
    const [firstUserDocs, setFirstUserDocs] = useState<(firebase.firestore.DocumentSnapshot | null)[]>([null]);
    const [hasMoreUsers, setHasMoreUsers] = useState(true);
    const [onlineStatus, setOnlineStatus] = useState<{ [uid: string]: boolean }>({});
    const [pixHistory, setPixHistory] = useState<PixHistoryItem[]>([]);
    const [pixHistorySearch, setPixHistorySearch] = useState('');

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
    const pixConfigDocRef = useMemo(() => db.collection('configs').doc('payment'), []);
    const pixHistoryCollectionRef = useMemo(() => db.collection('pix_history'), []);


    useEffect(() => {
        const handleVisibilityChange = () => setIsTabVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
    
    useEffect(() => {
        const unsubPix = pixConfigDocRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data() as any;
                setPixConfig({
                    key: data.pixKey || '',
                    name: data.merchantName || '',
                    city: data.merchantCity || '',
                    whatsapp: data.whatsappNumber || ''
                });
            }
            setIsLoadingPixConfig(false);
        });
        return () => unsubPix();
    }, [pixConfigDocRef]);


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

        const unsubPixHistory = pixHistoryCollectionRef.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixHistoryItem));
            setPixHistory(history);
        });

        return () => { 
            unsubscribe();
            unsubHistory();
            unsubChat();
            unsubLogs();
            unsubPixHistory();
        };
    }, [gameDocRef, purchaseHistoryCollectionRef, chatCollectionRef, adminLogsCollectionRef, pixHistoryCollectionRef]);
    
    // Game loop logic, allowing the Admin Panel to act as the host
    useEffect(() => {
        if (!gameState || gameState.host !== user.uid || gameState.status !== 'running' || !isTabVisible) {
            isGameLoopRunning.current = false;
            return;
        }
    
        const gameLoop = setInterval(async () => {
            if (isGameLoopRunning.current) {
                return;
            }
            isGameLoopRunning.current = true;
    
            try {
                await db.runTransaction(async (transaction) => {
                    const gameDoc = await transaction.get(gameDocRef);
                    if (!gameDoc.exists) throw new Error("Jogo não encontrado na transação.");
                    const currentGameState = gameDoc.data() as GameState;
    
                    if (currentGameState.status !== 'running') {
                        return;
                    }
    
                    let newCountdown = currentGameState.countdown - 1;
    
                    if (newCountdown > 0) {
                        transaction.update(gameDocRef, { countdown: newCountdown });
                    } else {
                        const drawnNumbers = currentGameState.drawnNumbers;
                        if (drawnNumbers.length >= 60) {
                            transaction.update(gameDocRef, { status: 'ended', winners: [] });
                            return;
                        }
    
                        let newNumber;
                        do {
                            newNumber = Math.floor(Math.random() * 60) + 1;
                        } while (drawnNumbers.includes(newNumber));
    
                        const updatedDrawnNumbers = [...drawnNumbers, newNumber];
                        const winners: { uid: string, displayName: string, card: number[] }[] = [];
                        const updatedPlayers = { ...currentGameState.players };
    
                        const playerIds = Object.keys(currentGameState.players || {});
                        for (const uid of playerIds) {
                            const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                            const playerCardsDoc = await transaction.get(playerCardsRef);
                            
                            if (playerCardsDoc.exists) {
                                const cards = playerCardsDoc.data()?.cards as BingoCardData[] || [];
                                let bestProgress = 99;
    
                                for (const card of cards) {
                                    const { isBingo, numbersToWin } = calculateCardProgress(card.numbers, updatedDrawnNumbers);
                                    if (isBingo) {
                                        winners.push({
                                            uid: uid,
                                            displayName: currentGameState.players[uid].displayName,
                                            card: card.numbers
                                        });
                                    }
                                    if (numbersToWin < bestProgress) {
                                        bestProgress = numbersToWin;
                                    }
                                }
                                if (updatedPlayers[uid]) {
                                    updatedPlayers[uid].progress = bestProgress;
                                }
                            }
                        }
    
                        if (winners.length > 0) {
                            transaction.update(gameDocRef, {
                                status: 'ended',
                                winners: winners,
                                drawnNumbers: updatedDrawnNumbers,
                                players: updatedPlayers,
                            });
                        } else {
                            transaction.update(gameDocRef, {
                                drawnNumbers: updatedDrawnNumbers,
                                countdown: currentGameState.drawIntervalDuration || 5,
                                players: updatedPlayers,
                            });
                        }
                    }
                });
            } catch (error) {
                console.error("Erro no loop do jogo (Admin Panel):", error);
            } finally {
                isGameLoopRunning.current = false;
            }
        }, 1000);
    
        return () => clearInterval(gameLoop);
    }, [gameState, user.uid, gameDocRef, isTabVisible]);

    const fetchUsers = useCallback(async () => {
        if (activeTab !== 'users') return;
        setIsLoadingUsers(true);

        try {
            const usersCollection = db.collection('users');
            let query: firebase.firestore.Query = usersCollection.orderBy('displayName');

            if (userSearch) {
                const lowerSearch = userSearch.toLowerCase();
                query = query.where('displayName', '>=', lowerSearch).where('displayName', '<=', lowerSearch + '\uf8ff');
            }
            
            if (userPage > 1 && firstUserDocs[userPage - 1]) {
                query = query.startAfter(firstUserDocs[userPage - 1]);
            }
            
            query = query.limit(USERS_PER_PAGE);
            
            const snapshot = await query.get();
            const newUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as ManagedUser));

            setManagedUsers(newUsers);
            
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            setLastUserDoc(lastDoc);
            
            if (userPage >= firstUserDocs.length && lastDoc) {
                setFirstUserDocs(prev => [...prev, lastDoc]);
            }
            setHasMoreUsers(snapshot.docs.length === USERS_PER_PAGE);
        } catch (error) {
            console.error("Error fetching users:", error);
            showNotification('Falha ao carregar usuários.', 'error');
        } finally {
            setIsLoadingUsers(false);
        }
    }, [activeTab, userPage, userSearch, firstUserDocs, showNotification]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            // Reset pagination when search query changes
            setUserPage(1);
            setLastUserDoc(null);
            setFirstUserDocs([null]);
            fetchUsers();
        }, 500);
    
        return () => {
            clearTimeout(handler);
        };
    }, [userSearch]);

    // Listen for online status
    useEffect(() => {
        const statusRef = db.collection('player_status');
        const unsub = statusRef.onSnapshot(snapshot => {
            const now = Date.now();
            const currentOnline: { [uid: string]: boolean } = {};
            let count = 0;
            snapshot.forEach(doc => {
                const lastSeen = doc.data().lastSeen?.toMillis();
                if (lastSeen && (now - lastSeen < 30000)) {
                    currentOnline[doc.id] = true;
                    count++;
                }
            });
            setOnlineStatus(currentOnline);
            setOnlinePlayersCount(count);
        });
        return () => unsub();
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

    const filteredPixHistory = useMemo(() => {
        if (!pixHistorySearch) return pixHistory;
        const lowercasedQuery = pixHistorySearch.toLowerCase();
        return pixHistory.filter(item =>
            item.targetName.toLowerCase().includes(lowercasedQuery) ||
            item.adminName.toLowerCase().includes(lowercasedQuery)
        );
    }, [pixHistory, pixHistorySearch]);
    
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
    
    const handleEditUserFichas = async (managedUser: ManagedUser) => {
        const amountStr = window.prompt(`Editar Fichas para ${managedUser.displayName}.\nUse um valor negativo para remover (ex: -50).`);
        if (!amountStr) return;
    
        const amount = parseInt(amountStr, 10);
        if (isNaN(amount) || amount === 0) {
            showNotification('Valor inválido.', 'error');
            return;
        }
    
        const justification = window.prompt(`Justificativa para ${amount > 0 ? 'adicionar' : 'remover'} ${Math.abs(amount)} fichas:`);
        if (!justification || justification.trim() === '') {
            showNotification('A justificação é obrigatória.', 'error');
            return;
        }
    
        let brlAmount = 0;
        if (amount > 0) {
            const brlAmountStr = window.prompt(`Qual o valor em R$ pago via Pix por ${managedUser.displayName}? (Deixe em branco se não for uma compra)`);
            if (brlAmountStr) {
                const parsedAmount = parseFloat(brlAmountStr.replace(',', '.'));
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    showNotification('Valor em R$ inválido.', 'error');
                    return;
                }
                brlAmount = parsedAmount;
            }
        }
    
        try {
            const batch = db.batch();
            const userRef = db.collection('users').doc(managedUser.uid);
            const adminLogRef = db.collection('admin_logs').doc();
    
            batch.update(userRef, { fichas: increment(amount) });
    
            const logDetails: any = { amount };
            if (brlAmount > 0) {
                logDetails.brlAmount = brlAmount;
            }
            batch.set(adminLogRef, {
                adminUid: user.uid,
                adminName: user.displayName,
                action: amount > 0 ? 'add_fichas' : 'remove_fichas',
                targetUid: managedUser.uid,
                targetName: managedUser.displayName,
                details: logDetails,
                justification: justification,
                timestamp: serverTimestamp(),
            });
    
            if (brlAmount > 0) {
                const pixHistoryRef = db.collection('pix_history').doc();
                batch.set(pixHistoryRef, {
                    targetUid: managedUser.uid,
                    targetName: managedUser.displayName,
                    adminUid: user.uid,
                    adminName: user.displayName,
                    fichasAmount: amount,
                    brlAmount: brlAmount,
                    timestamp: serverTimestamp(),
                });
            }
    
            await batch.commit();
    
            showNotification(`${Math.abs(amount)} fichas ${amount > 0 ? 'adicionadas para' : 'removidas de'} ${managedUser.displayName}.`, 'success');
            setManagedUsers(users => users.map(u => u.uid === managedUser.uid ? { ...u, fichas: u.fichas + amount } : u));
        } catch (error) {
            showNotification('Falha ao editar fichas.', 'error');
            console.error(error);
        }
    };

    const handleSendPasswordReset = async (email: string) => {
        if (window.confirm(`Tem certeza que deseja enviar um e-mail de redefinição de senha para ${email}?`)) {
            try {
                await auth.sendPasswordResetEmail(email);
                showNotification(`E-mail de redefinição enviado para ${email}.`, 'success');
            } catch (error) {
                showNotification('Falha ao enviar o e-mail.', 'error');
                console.error(error);
            }
        }
    };
    
    const handleDeleteSpecificCard = async (cardToDelete: BingoCardData, ownerId: string, ownerName: string) => {
        const justification = window.prompt(`Justifique a remoção desta cartela específica de ${ownerName}:`);
        if (!justification || justification.trim() === '') {
            showNotification('A justificação é obrigatória.', 'error');
            return;
        }

        const playerCardsRef = db.collection('player_cards').doc(ownerId).collection('cards').doc('active_game');
        const userRef = db.collection('users').doc(ownerId);
        const adminLogRef = db.collection('admin_logs').doc();

        try {
            await db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameDocRef);
                const playerCardsDoc = await transaction.get(playerCardsRef);
                const userDoc = await transaction.get(userRef);

                if (!gameDoc.exists || !playerCardsDoc.exists || !userDoc.exists) {
                    throw new Error("Não foi possível encontrar todos os dados necessários.");
                }

                const playerCardsData = playerCardsDoc.data();
                const currentCards = playerCardsData?.cards as BingoCardData[] || [];
                
                let cardIndex = -1;

                if (cardToDelete.id) {
                    cardIndex = currentCards.findIndex(c => c.id === cardToDelete.id);
                } else {
                    // Fallback for old cards without an ID. We assume `numbers` array is unique enough.
                    const cardToDeleteNumbersJSON = JSON.stringify(cardToDelete.numbers);
                    cardIndex = currentCards.findIndex(c => JSON.stringify(c.numbers) === cardToDeleteNumbersJSON);
                }

                if (cardIndex === -1) {
                    throw new Error("A cartela selecionada não foi encontrada para este jogador.");
                }
                
                // Create a new array without the card at the found index.
                const updatedCards = [...currentCards.slice(0, cardIndex), ...currentCards.slice(cardIndex + 1)];

                transaction.update(playerCardsRef, { cards: updatedCards });
                transaction.update(gameDocRef, {
                    prizePool: increment(-9),
                    [`players.${ownerId}.cardCount`]: increment(-1),
                });
                transaction.update(userRef, { fichas: increment(10) });

                transaction.set(adminLogRef, {
                    adminUid: user.uid,
                    adminName: user.displayName,
                    targetUid: ownerId,
                    targetName: ownerName,
                    action: 'remove_specific_card',
                    justification: justification,
                    details: {
                        removedCardId: cardToDelete.id || `legacy_card_${cardIndex}`, // Provide a fallback to prevent undefined
                        removedCardNumbers: cardToDelete.numbers,
                    },
                    timestamp: serverTimestamp(),
                });
            });

            showNotification('Cartela removida e jogador reembolsado.', 'success');
            
            // Update local state for immediate UI feedback
            setPlayerCardDetails(prev => {
                if (!prev[ownerId]) return prev;

                let cardIndex = -1;
                if (cardToDelete.id) {
                    cardIndex = prev[ownerId].findIndex(c => c.id === cardToDelete.id);
                } else {
                    const cardToDeleteNumbersJSON = JSON.stringify(cardToDelete.numbers);
                    cardIndex = prev[ownerId].findIndex(c => JSON.stringify(c.numbers) === cardToDeleteNumbersJSON);
                }

                if (cardIndex !== -1) {
                    const updatedPlayerCards = [...prev[ownerId].slice(0, cardIndex), ...prev[ownerId].slice(cardIndex + 1)];
                    return { ...prev, [ownerId]: updatedPlayerCards };
                }

                return prev;
            });

            setSelectedCardModal(null); // Close modal on success

        } catch (error: any) {
            console.error("Erro ao remover cartela específica:", error);
            showNotification(error.message || 'Falha ao remover a cartela específica.', 'error');
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
    
    const handleSavePixConfig = async () => {
        if (!pixConfig.key || !pixConfig.name || !pixConfig.city || !pixConfig.whatsapp) {
            showNotification('Por favor, preencha todos os campos de configuração do PIX.', 'error');
            return;
        }

        try {
            const configData = {
                pixKey: pixConfig.key,
                merchantName: pixConfig.name,
                merchantCity: pixConfig.city,
                whatsappNumber: pixConfig.whatsapp,
            };
            await pixConfigDocRef.set(configData, { merge: true });

            await db.collection('admin_logs').add({
                adminUid: user.uid,
                adminName: user.displayName,
                action: 'save_pix_config',
                details: configData,
                timestamp: serverTimestamp(),
            });

            showNotification('Configurações de PIX salvas com sucesso!', 'success');
        } catch (error) {
            showNotification('Falha ao salvar configurações de PIX.', 'error');
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

    const handleStartGame = async () => {
        if (!gameState) {
            showNotification('Estado do jogo não encontrado.', 'error');
            return;
        }

        // Case 1: Game is waiting, just start it safely.
        if (gameState.status === 'waiting') {
            if (!window.confirm("Tem certeza de que deseja iniciar a partida?")) return;

            try {
                await gameDocRef.update({
                    status: 'running',
                    host: user.uid, // Assign host
                    countdown: gameState.drawIntervalDuration || 5,
                });

                await db.collection('admin_logs').add({
                    adminUid: user.uid,
                    adminName: user.displayName,
                    action: 'start_game_from_waiting',
                    timestamp: serverTimestamp(),
                });

                showNotification('Partida iniciada com sucesso!', 'success');

            } catch (error: any) {
                showNotification(error.message || 'Falha ao iniciar a partida.', 'error');
            }
        // Case 2: Game is running/paused, so perform a full reset and start a new round.
        } else {
            if (!window.confirm("Esta ação irá resetar a partida atual e iniciar uma nova rodada imediatamente. Deseja continuar?")) return;

            try {
                await db.runTransaction(async (transaction) => {
                    const gameDoc = await transaction.get(gameDocRef);
                    if (!gameDoc.exists) throw new Error("O estado do jogo não foi encontrado.");
                    const currentGameState = gameDoc.data() as GameState;

                    const playerIds = Object.keys(currentGameState.players || {});
                    if (playerIds.length > 0) {
                        const historyRef = db.collection('game_history').doc();
                        transaction.set(historyRef, {
                            winners: currentGameState.winners || [],
                            drawnNumbers: currentGameState.drawnNumbers || [],
                            prizePool: currentGameState.prizePool || 0,
                            completedAt: serverTimestamp(),
                            roundId: currentGameState.roundId || 'unknown'
                        });

                        for (const uid of playerIds) {
                            const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                            transaction.delete(playerCardsRef);
                        }
                    }
                    
                    const newRoundId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                    transaction.update(gameDocRef, {
                        status: 'running',
                        host: user.uid,
                        drawnNumbers: [],
                        prizePool: 0,
                        winners: [],
                        countdown: currentGameState.drawIntervalDuration || 5,
                        lastWinnerAnnouncement: "Nova partida iniciada pelo administrador.",
                        players: {},
                        pauseReason: '',
                        roundId: newRoundId,
                    });

                    const adminLogRef = db.collection('admin_logs').doc();
                    transaction.set(adminLogRef, {
                        adminUid: user.uid,
                        adminName: user.displayName,
                        action: 'force_reset_and_start_game',
                        timestamp: serverTimestamp(),
                    });
                });

                showNotification('Nova rodada iniciada com sucesso!', 'success');

            } catch (error: any) {
                showNotification(error.message || 'Falha ao forçar o início do jogo.', 'error');
            }
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

                if (gameState.status === 'ended' || gameState.status === 'running') {
                    const historyRef = db.collection('game_history').doc();
                    batch.set(historyRef, {
                        winners: gameState.winners,
                        drawnNumbers: gameState.drawnNumbers,
                        prizePool: gameState.prizePool,
                        completedAt: serverTimestamp()
                    });
                }
                
                const playerIds = Object.keys(gameState.players || {});
                if (playerIds.length > 0) {
                    for (const uid of playerIds) {
                        const playerCardsRef = db.collection('player_cards').doc(uid).collection('cards').doc('active_game');
                        batch.delete(playerCardsRef);
                    }
                }

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
                    host: null,
                    roundId: newRoundId,
                });

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
            return;
        }
        
        try {
            if (isPausing) {
                await gameDocRef.update({ status: 'paused', pauseReason: reason });
            } else {
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
                    <div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Game Controls */}
                            <div className="bg-gray-900 p-4 rounded-lg">
                                 <h3 className="text-xl font-semibold mb-4 text-center">Controles do Jogo</h3>
                                 <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button onClick={handleStartGame} className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold">Iniciar</button>
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
                        <div className="mt-6 bg-gray-900 p-4 rounded-lg">
                            <BingoMasterBoard drawnNumbers={gameState?.drawnNumbers || []} />
                        </div>
                    </div>
                );
            case 'users':
                 return (
                    <div className="bg-gray-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-center">Gerenciar Usuários</h3>
                         <input
                            type="text"
                            placeholder="Buscar por nome de usuário..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="w-full p-2 mb-4 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-400"
                        />
                        <div className="space-y-2 min-h-[400px] max-h-[400px] overflow-y-auto pr-2">
                            {isLoadingUsers ? (
                                <p className="text-center text-gray-400">Carregando usuários...</p>
                            ) : managedUsers.length > 0 ? (
                                managedUsers.map(managedUser => (
                                    <div key={managedUser.uid} className="bg-gray-700 p-2 rounded-md">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${onlineStatus[managedUser.uid] ? 'bg-green-500' : 'bg-red-500'}`} title={onlineStatus[managedUser.uid] ? 'Online' : 'Offline'}></span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold truncate" title={managedUser.displayName}>{managedUser.displayName}</p>
                                                    <p className="text-sm text-gray-400 truncate" title={managedUser.email}>{managedUser.email}</p>
                                                    <p className="text-sm text-yellow-400">Fichas: {managedUser.fichas}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button onClick={() => handleEditUserFichas(managedUser)} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg" title="Editar Fichas"><EditIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleSendPasswordReset(managedUser.email)} className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg" title="Resetar Senha"><KeyIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleTogglePlayer(managedUser.uid)} className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg" title="Ver Detalhes"><EyeIcon className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                         {expandedPlayerId === managedUser.uid && (
                                            <>
                                                <div className="p-2 mt-2 border-t border-gray-600 bg-gray-800">
                                                    <h4 className="font-semibold text-center mb-2">Cartelas Ativas</h4>
                                                    {isLoadingCards && <p className="text-sm text-center text-gray-400">Carregando...</p>}
                                                    {!isLoadingCards && playerCardDetails[managedUser.uid] && playerCardDetails[managedUser.uid].length > 0 ? (
                                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                                            {playerCardDetails[managedUser.uid].map((card, index) => (
                                                                <div key={card?.id || index} className="bg-gray-900 p-2 rounded-lg flex items-center justify-between">
                                                                    <p className="text-sm font-semibold text-purple-300">Cartela #{index + 1}</p>
                                                                    <button
                                                                        onClick={() => setSelectedCardModal({ card: card, ownerId: managedUser.uid, ownerName: managedUser.displayName })}
                                                                        className="p-1 text-gray-400 hover:text-white transition-colors"
                                                                        aria-label="Visualizar detalhes da cartela"
                                                                    >
                                                                        <EyeIcon className="w-5 h-5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        !isLoadingCards && <p className="text-sm text-center text-gray-500">Nenhuma cartela ativa.</p>
                                                    )}
                                                </div>
                                                <div className="p-2 mt-2 border-t border-gray-600 bg-gray-800">
                                                    <h4 className="font-semibold text-center mb-2">Informações de Premiação (PIX)</h4>
                                                    {managedUser.pixKey ? (
                                                        <div className="text-sm space-y-1 text-left px-2">
                                                            <p><strong className="text-gray-400">Nome Completo:</strong> {managedUser.fullName}</p>
                                                            <p><strong className="text-gray-400">Tipo da Chave:</strong> {managedUser.pixKeyType?.toUpperCase()}</p>
                                                            <p><strong className="text-gray-400">Chave PIX:</strong> {managedUser.pixKey}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-center text-gray-500">Nenhuma informação de PIX cadastrada.</p>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-400 italic">Nenhum usuário encontrado.</p>
                            )}
                        </div>
                         <div className="flex justify-between items-center mt-4">
                            <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1 || isLoadingUsers} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                                Anterior
                            </button>
                            <span className="font-semibold">Página {userPage}</span>
                            <button onClick={() => setUserPage(p => p + 1)} disabled={!hasMoreUsers || isLoadingUsers} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                                Próxima
                            </button>
                        </div>
                    </div>
                );
            case 'pixHistory':
                 return (
                    <div className="bg-gray-900 p-4 rounded-lg flex flex-col min-h-0 h-[500px]">
                        <h3 className="text-xl font-semibold mb-2 text-center flex-shrink-0">Histórico de Compras PIX</h3>
                        <input
                            type="text"
                            placeholder="Buscar por jogador ou admin..."
                            value={pixHistorySearch}
                            onChange={(e) => setPixHistorySearch(e.target.value)}
                            className="w-full p-2 mb-2 bg-gray-700 border border-gray-600 rounded-lg text-sm placeholder-gray-400 flex-shrink-0"
                        />
                        <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                            {filteredPixHistory.length > 0 ? (
                                filteredPixHistory.map(item => (
                                    <div key={item.id} className="bg-gray-700 p-3 rounded-md text-sm">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-lg text-purple-300">{item.targetName}</p>
                                                <p className="text-xs text-gray-400">Admin: {item.adminName}</p>
                                            </div>
                                            <div className="text-right">
                                                 <p className="font-bold text-lg text-green-400">R$ {item.brlAmount.toFixed(2).replace('.', ',')}</p>
                                                 <p className="text-yellow-400">{item.fichasAmount} Fichas</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 text-right mt-1">{item.timestamp ? new Date(item.timestamp.toDate()).toLocaleString('pt-BR') : '...'}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-400 italic mt-4">
                                    {pixHistory.length === 0 ? 'Nenhuma compra via Pix registrada.' : 'Nenhum resultado encontrado.'}
                                </p>
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
            case 'settings':
                return (
                     <div className="bg-gray-900 p-6 rounded-lg max-w-2xl mx-auto">
                        <h3 className="text-2xl font-semibold mb-6 text-center text-purple-300">Configurações de Pagamento (PIX)</h3>
                        {isLoadingPixConfig ? <p>Carregando configurações...</p> : (
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="pix-key" className="block text-sm font-medium text-gray-300 mb-1">Chave Pix</label>
                                    <input id="pix-key" type="text" value={pixConfig.key} onChange={e => setPixConfig(p => ({ ...p, key: e.target.value }))} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg" placeholder="Sua chave PIX" />
                                </div>
                                <div>
                                    <label htmlFor="pix-name" className="block text-sm font-medium text-gray-300 mb-1">Nome do Beneficiário</label>
                                    <input id="pix-name" type="text" value={pixConfig.name} onChange={e => setPixConfig(p => ({ ...p, name: e.target.value }))} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg" placeholder="Nome completo" />
                                </div>
                                <div>
                                    <label htmlFor="pix-city" className="block text-sm font-medium text-gray-300 mb-1">Cidade do Beneficiário</label>
                                    <input id="pix-city" type="text" value={pixConfig.city} onChange={e => setPixConfig(p => ({ ...p, city: e.target.value }))} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg" placeholder="Cidade (sem espaços, máx. 15 caracteres)" />
                                </div>
                                <div>
                                    <label htmlFor="pix-whatsapp" className="block text-sm font-medium text-gray-300 mb-1">WhatsApp para Suporte</label>
                                    <input id="pix-whatsapp" type="text" value={pixConfig.whatsapp} onChange={e => setPixConfig(p => ({ ...p, whatsapp: e.target.value }))} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg" placeholder="(XX) XXXXX-XXXX" />
                                </div>
                                <button onClick={handleSavePixConfig} className="mt-6 w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold">Salvar Configurações de PIX</button>
                            </div>
                        )}
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
                    <TabButton isActive={activeTab === 'users'} onClick={() => setActiveTab('users')}>
                        Gerenciar Usuários
                    </TabButton>
                    <TabButton isActive={activeTab === 'pixHistory'} onClick={() => setActiveTab('pixHistory')}>
                        Histórico PIX
                    </TabButton>
                    <TabButton isActive={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
                        Logs & Moderação
                    </TabButton>
                    <TabButton isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
                        Configurações
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
                        <p className="text-sm text-gray-400 mb-4 font-mono">ID: {selectedCardModal.card.id}</p>
                        <div className="grid grid-cols-5 gap-4 text-center">
                            {['B', 'I', 'N', 'G', 'O'].map((letter, colIndex) => (
                                <div key={letter}>
                                    <h4 className="text-xl font-bold mb-2 text-purple-300">{letter}</h4>
                                    <div className="space-y-2">
                                        {Array.from({ length: 5 }).map((_, rowIndex) => {
                                            const num = selectedCardModal.card.numbers[rowIndex * 5 + colIndex];
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
                        <div className="mt-6 flex gap-4">
                            <button 
                                onClick={() => setSelectedCardModal(null)} 
                                className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={() => handleDeleteSpecificCard(selectedCardModal.card, selectedCardModal.ownerId, selectedCardModal.ownerName)}
                                disabled={gameState?.status !== 'waiting'}
                                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                <TrashIcon className="w-5 h-5" />
                                Deletar Cartela
                            </button>
                        </div>
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