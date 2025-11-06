import React, { useEffect, useState } from 'react';
import { calculateCardProgress } from '../utils/bingoUtils';

interface BingoCardProps {
    numbers: number[];
    drawnNumbers: number[];
    onBingo: (winningCard: number[]) => void;
    gameStatus: 'waiting' | 'running' | 'ended';
    isWinningCard?: boolean;
}

export const BingoCard: React.FC<BingoCardProps> = ({ numbers, drawnNumbers, onBingo, gameStatus, isWinningCard = false }) => {
    const [hasBingo, setHasBingo] = useState(false);
    const lastDrawnNumber = drawnNumbers[drawnNumbers.length - 1];

    const isMarked = (num: number) => {
        if (num === 0) return true; // Free space
        return drawnNumbers.includes(num);
    };

    useEffect(() => {
        if (gameStatus === 'running' && !hasBingo) {
            const { isBingo } = calculateCardProgress(numbers, drawnNumbers);
            if (isBingo) {
                setHasBingo(true);
                onBingo(numbers);
            }
        }
        if (gameStatus === 'waiting' || gameStatus === 'ended') {
            setHasBingo(false); // Reset for new game
        }
    }, [drawnNumbers, onBingo, hasBingo, gameStatus, numbers]);
    
    return (
        <div className={`grid grid-cols-5 gap-1 p-2 rounded-lg shadow-lg aspect-square transition-all duration-500 ${hasBingo || isWinningCard ? 'bg-green-500 bingo-animation' : 'bg-blue-900 bg-opacity-50'}`}>
            {numbers.map((num, index) => {
                const isCenter = index === 12;
                const marked = isMarked(num);
                const isLast = num === lastDrawnNumber;
                
                return (
                    <div key={index} className={`flex items-center justify-center rounded-md aspect-square font-bold text-lg transition-all duration-300
                        ${isCenter ? 'bg-yellow-500 text-black' : ''}
                        ${marked && !isCenter ? 'bg-purple-600 text-white scale-105' : ''}
                        ${!marked && !isCenter ? 'bg-gray-700 text-gray-300' : ''}
                        ${marked && !isCenter && isLast && gameStatus === 'running' ? 'marked-animation' : ''}
                    `}>
                        {isCenter ? 'GRÁTIS' : num}
                    </div>
                );
            })}
        </div>
    );
};