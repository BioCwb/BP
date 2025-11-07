import React, { useState, useEffect, useMemo } from 'react';
import { db, serverTimestamp } from '../firebase/config';
import type { GameState } from './BingoGame';

interface AdminPanelProps {
    onBack: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
    const [lobbyTime, setLobbyTime] = useState(30);
    const [drawTime, setDrawTime] = useState(8);
    const [endTime, setEndTime] = useState(15);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const gameDocRef = useMemo(() => db.collection('games').doc('active_game'), []);

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
        return () => unsubscribe();
    }, [gameDocRef]);

    useEffect(() => {
        const statusCollectionRef = db.collection('player_status');

        const countOnlinePlayers = () => {
            // A player is online if they've been seen in the last 30 seconds.
            const thirtySecondsAgo = new Date(Date.now() - 30000);
            
            // Note: This query requires a Firestore index on 'lastSeen'.
            statusCollectionRef.where('lastSeen', '>', thirtySecondsAgo).get()
                .then(snapshot => {
                    setOnlinePlayersCount(snapshot.size);
                })
                .catch(err => {
                    console.error("Error getting online player count: ", err);
                });
        };

        countOnlinePlayers();
        const intervalId = setInterval(countOnlinePlayers, 10000); // Refresh every 10 seconds

        return () => clearInterval(intervalId);
    }, []);
    
    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
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
        // FIX: The type of `player` in the reduce function below was inferred as `unknown`.
        // Casting the result of `Object.values` to a typed array resolves the error.
        const playersArray = Object.values(gameState.players) as { cardCount: number }[];
        const cardCount = playersArray.reduce((acc, player) => acc + (player.cardCount || 0), 0);
        return { totalPlayers: playersArray.length, totalCards: cardCount };
    }, [gameState?.players]);

    const canForceStart = gameState?.status === 'waiting' && totalPlayers >= 2 && totalCards >= 2;

    const handleForceStart = async () => {
        if (canForceStart) {
            try {
                await gameDocRef.update({ status: 'running', countdown: gameState.drawIntervalDuration || 5 });
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

                // Archive the game if it has properly ended.
                if (gameState.status === 'ended') {
                    const historyRef = db.collection('game_history').doc();
                    batch.set(historyRef, {
                        winners: gameState.winners,
                        drawnNumbers: gameState.drawnNumbers,
                        prizePool: gameState.prizePool,
                        completedAt: serverTimestamp()
                    });
                }
                
                // Reset active game
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

    return (
        <div className="w-full max-w-2xl bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold">Painel de Administração</h2>
                <button onClick={onBack} className="text-gray-300 hover:text-white">&larr; Voltar para o Lobby</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-center">
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
            
            <div className="bg-gray-900 p-4 rounded-lg mb-6">
                 <h3 className="text-xl font-semibold mb-4 text-center">Controles do Jogo</h3>
                 <div className="flex gap-4 justify-center">
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

                     <button onClick={handleResetGame} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">Resetar Jogo</button>
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
             {message && (
                <div className={`mt-4 text-center p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
};