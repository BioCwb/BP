import React from 'react';

interface BingoMasterBoardProps {
  drawnNumbers: number[];
}

const BINGO_COLS = [
  { letter: 'B', min: 1, max: 12 },
  { letter: 'I', min: 13, max: 24 },
  { letter: 'N', min: 25, max: 36 },
  { letter: 'G', min: 37, max: 48 },
  { letter: 'O', min: 49, max: 60 },
];

export const BingoMasterBoard: React.FC<BingoMasterBoardProps> = ({ drawnNumbers }) => {
  return (
    <div>
      <h2 className="text-xl font-bold text-center mb-4 sticky top-0 bg-gray-800 py-2">Painel Principal ({drawnNumbers.length}/60)</h2>
      <div className="grid grid-cols-5 gap-x-2 text-center">
        {BINGO_COLS.map(col => (
          <div key={col.letter}>
            <div className="text-2xl font-bold text-purple-400 mb-2">{col.letter}</div>
            <div className="space-y-1">
              {Array.from({ length: 12 }, (_, i) => col.min + i).map(num => (
                <div 
                  key={num} 
                  className={`w-full py-1 rounded-md font-bold text-sm transition-all duration-300 ${drawnNumbers.includes(num) ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-700 text-gray-400'}`}
                >
                  {num}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};