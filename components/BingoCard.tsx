import React, { useState, useEffect } from 'react';

interface BingoCardProps {
    numbers: number[];
    drawnNumbers: number[];
    gameStatus: 'waiting' | 'running' | 'ended' | 'paused';
    isWinningCard?: boolean;
    lastDrawnNumber?: number | null;
}

export const BingoCard: React.FC<BingoCardProps> = ({ numbers, drawnNumbers, gameStatus, isWinningCard = false, lastDrawnNumber }) => {
    // Local state for player's manual marks. The center square is always marked.
    const [markedByPlayer, setMarkedByPlayer] = useState<Set<number>>(() => {
        const initial = new Set<number>();
        // The center square is represented by 0.
        if (numbers[12] === 0) {
            initial.add(0);
        }
        return initial;
    });

    // Automatically mark all drawn numbers when the game ends to show the final state.
    useEffect(() => {
        if (gameStatus === 'ended') {
            const allDrawn = new Set(drawnNumbers);
            if (numbers[12] === 0) {
                allDrawn.add(0);
            }
            setMarkedByPlayer(allDrawn);
        }
    }, [gameStatus, drawnNumbers, numbers]);

    const handleNumberClick = (num: number) => {
        // Player can only interact during a running game, and only on drawn numbers.
        // The free space (num=0) cannot be toggled.
        if (gameStatus !== 'running' || (num !== 0 && !drawnNumbers.includes(num))) {
            return;
        }

        setMarkedByPlayer(prev => {
            const newSet = new Set(prev);
            if (newSet.has(num)) {
                // Cannot un-mark the free space
                if (num !== 0) {
                    newSet.delete(num);
                }
            } else {
                newSet.add(num);
            }
            return newSet;
        });
    };

    return (
        <div className={`relative flex flex-col p-2 rounded-lg shadow-lg transition-all duration-500 ${isWinningCard ? 'winning-card-animation' : 'bg-blue-900 bg-opacity-50'}`}>
            <div className="grid grid-cols-5 gap-1 aspect-square">
                {numbers.map((num, index) => {
                    const isCenter = index === 12;
                    const isDrawn = drawnNumbers.includes(num);
                    const isMarked = markedByPlayer.has(isCenter ? 0 : num);
                    const isLastDrawn = num !== 0 && num === lastDrawnNumber;
                    
                    const canClick = gameStatus === 'running' && (isDrawn || isCenter);

                    // Determine cell styling based on its state
                    let cellClasses = 'flex items-center justify-center rounded-md aspect-square font-bold text-lg transition-all duration-300 border-2 ';
                    
                    cellClasses += canClick ? 'cursor-pointer' : 'cursor-default';

                    if (isCenter) {
                        cellClasses += ' bg-yellow-500 text-black border-yellow-300';
                    } else if (isMarked) {
                        // Player has marked this number (which must be a drawn number)
                        cellClasses += ' bg-violet-500 text-white border-violet-400 scale-105 shadow-lg marked-animation';
                    } else if (isLastDrawn) {
                        // Special highlight for the latest drawn number that the player hasn't marked yet.
                        cellClasses += ' last-number-attention-animation text-white border-transparent';
                    } else if (isDrawn) {
                        // The number is drawn but the player hasn't marked it yet. Add a green border to indicate it's available.
                        cellClasses += ' bg-gray-700 text-gray-300 border-green-500';
                    } else {
                        // The number has not been drawn yet
                        cellClasses += ' bg-gray-700 text-gray-300 border-gray-600';
                    }

                    return (
                        <div 
                            key={index}
                            onClick={() => handleNumberClick(num)}
                            className={cellClasses.trim()}
                        >
                            {isCenter ? 'GRÁTIS' : num}
                        </div>
                    );
                })}
            </div>
            {isWinningCard && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-yellow-400 text-black font-extrabold text-2xl px-6 py-2 rounded-lg shadow-2xl transform -rotate-12 winner-badge-animation">
                        VENCEDOR!
                    </div>
                </div>
            )}
        </div>
    );
};