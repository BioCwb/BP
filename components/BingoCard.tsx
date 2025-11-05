import React, { useEffect, useState, useMemo } from 'react';

interface BingoCardProps {
    numbers: number[][];
    drawnNumbers: number[];
    onBingo: () => void;
    gameStatus: 'waiting' | 'running' | 'ended';
}

export const BingoCard: React.FC<BingoCardProps> = ({ numbers, drawnNumbers, onBingo, gameStatus }) => {
    const [isWinner, setIsWinner] = useState(false);

    const isMarked = (num: number) => {
        if (num === 0) return true; // Free space
        return drawnNumbers.includes(num);
    };

    const checkForWin = useMemo(() => {
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                if (!isMarked(numbers[i][j])) {
                    return false; // If any number isn't marked, it's not a full card
                }
            }
        }
        return true; // All numbers marked
    }, [drawnNumbers, numbers]);

    useEffect(() => {
        if (gameStatus === 'running' && !isWinner && checkForWin) {
            setIsWinner(true);
            onBingo();
        }
        if (gameStatus === 'waiting') {
            setIsWinner(false); // Reset for new game
        }
    }, [checkForWin, onBingo, isWinner, gameStatus]);
    
    return (
        <div className={`grid grid-cols-5 gap-1 p-2 rounded-lg shadow-lg aspect-square ${isWinner ? 'bg-green-500 animate-pulse' : 'bg-blue-900 bg-opacity-50'}`}>
            {numbers.flat().map((num, index) => {
                const isCenter = index === 12;
                const marked = isMarked(num);
                return (
                    <div key={index} className={`flex items-center justify-center rounded-md aspect-square font-bold text-lg transition-colors duration-300
                        ${isCenter ? 'bg-yellow-500 text-black' : ''}
                        ${marked && !isCenter ? 'bg-purple-600 text-white scale-105' : ''}
                        ${!marked && !isCenter ? 'bg-gray-700 text-gray-300' : ''}
                    `}>
                        {isCenter ? 'FREE' : num}
                    </div>
                );
            })}
        </div>
    );
};
