import React, { useEffect, useState, useMemo, useRef } from 'react';
import { isWinningLine } from '../utils/bingoUtils';

interface BingoCardProps {
    cardIndex: number;
    numbers: number[];
    drawnNumbers: number[];
    markedNumbers: number[];
    onMarkNumber: (cardIndex: number, num: number) => void;
    onBingo: (cardIndex: number) => void;
    gameStatus: 'waiting' | 'running' | 'ended' | 'paused';
    isWinningCard?: boolean;
}

export const BingoCard: React.FC<BingoCardProps> = ({ cardIndex, numbers, drawnNumbers, markedNumbers, onMarkNumber, onBingo, gameStatus, isWinningCard = false }) => {
    const [timedOutNumbers, setTimedOutNumbers] = useState<number[]>([]);
    const timeoutsRef = useRef<{ [key: number]: number }>({});

    // Effect to manage adding highlights after a 3-second delay
    useEffect(() => {
        // This effect runs only when the game is running.
        if (gameStatus !== 'running') {
            setTimedOutNumbers([]); // Clear highlights if game is not running
            return;
        }

        // Identify numbers on the card that are drawn but not yet marked.
        const availableUnmarked = numbers.filter(
            num => num !== 0 && drawnNumbers.includes(num) && !markedNumbers.includes(num)
        );
        
        // Start timers for newly available numbers
        availableUnmarked.forEach(num => {
            if (!timeoutsRef.current[num]) {
                timeoutsRef.current[num] = window.setTimeout(() => {
                    setTimedOutNumbers(prev => [...prev, num]);
                }, 3000);
            }
        });

        // Clear timers and remove highlights for numbers that are now marked.
        markedNumbers.forEach(num => {
            if (timeoutsRef.current[num]) {
                clearTimeout(timeoutsRef.current[num]);
                delete timeoutsRef.current[num];
            }
        });

        // Update the timedOutNumbers state to remove any that have been marked.
        setTimedOutNumbers(prev => prev.filter(num => !markedNumbers.includes(num)));

        // Cleanup function to clear all timers when the component unmounts or dependencies change.
        return () => {
            Object.values(timeoutsRef.current).forEach(clearTimeout);
            timeoutsRef.current = {};
        };
    }, [drawnNumbers, markedNumbers, numbers, gameStatus]);


    const canCallBingo = useMemo(() => {
        if (gameStatus !== 'running') return false;
        return isWinningLine(numbers, markedNumbers);
    }, [numbers, markedNumbers, gameStatus]);
    
    return (
        <div className={`flex flex-col p-2 rounded-lg shadow-lg transition-all duration-500 ${isWinningCard ? 'bg-green-500 bingo-animation' : 'bg-blue-900 bg-opacity-50'}`}>
            <div className="grid grid-cols-5 gap-1 aspect-square">
                {numbers.map((num, index) => {
                    const isCenter = index === 12;
                    const isMarked = isCenter || markedNumbers.includes(num);
                    const isDrawn = drawnNumbers.includes(num);
                    const needsHighlight = timedOutNumbers.includes(num);

                    const canMark = isDrawn && !isCenter;

                    return (
                        <button 
                            key={index} 
                            onClick={() => canMark && onMarkNumber(cardIndex, num)}
                            disabled={!canMark || gameStatus !== 'running'}
                            className={`flex items-center justify-center rounded-md aspect-square font-bold text-lg transition-all duration-300 border-2
                            ${isMarked ? 'bg-purple-600 text-white border-purple-400 scale-105' : 'bg-gray-700 text-gray-300 border-gray-600'}
                            ${isCenter ? 'bg-yellow-500 text-black border-yellow-300' : ''}
                            ${needsHighlight ? 'highlight-animation border-yellow-400' : ''}
                            ${!canMark ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-opacity-80'}
                        `}>
                            {isCenter ? 'GRÁTIS' : num}
                        </button>
                    );
                })}
            </div>
            <button 
                onClick={() => onBingo(cardIndex)}
                disabled={!canCallBingo}
                className="mt-2 w-full py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                BINGO!
            </button>
        </div>
    );
};