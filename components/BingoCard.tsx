import React from 'react';

interface BingoCardProps {
    numbers: number[];
    drawnNumbers: number[];
    gameStatus: 'waiting' | 'running' | 'ended' | 'paused';
    isWinningCard?: boolean;
}

export const BingoCard: React.FC<BingoCardProps> = ({ numbers, drawnNumbers, gameStatus, isWinningCard = false }) => {
    return (
        <div className={`flex flex-col p-2 rounded-lg shadow-lg transition-all duration-500 ${isWinningCard ? 'bg-green-500 bingo-animation' : 'bg-blue-900 bg-opacity-50'}`}>
            <div className="grid grid-cols-5 gap-1 aspect-square">
                {numbers.map((num, index) => {
                    const isCenter = index === 12;
                    const isDrawn = drawnNumbers.includes(num);
                    const isMarked = isCenter || isDrawn;

                    return (
                        <div 
                            key={index}
                            className={`flex items-center justify-center rounded-md aspect-square font-bold text-lg transition-all duration-300 border-2
                            ${isMarked ? 'bg-purple-600 text-white border-purple-400 scale-105' : 'bg-gray-700 text-gray-300 border-gray-600'}
                            ${isCenter ? 'bg-yellow-500 text-black border-yellow-300' : ''}
                        `}>
                            {isCenter ? 'GRÁTIS' : num}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};