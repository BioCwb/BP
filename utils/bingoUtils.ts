// Helper function to generate a valid Bingo card as a flat array
export const generateBingoCard = (): number[] => {
    const card: number[][] = Array(5).fill(null).map(() => Array(5).fill(0));
    const ranges = [
        { col: 0, min: 1, max: 15 },
        { col: 1, min: 16, max: 30 },
        { col: 2, min: 31, max: 45 },
        { col: 3, min: 46, max: 60 },
        { col: 4, min: 61, max: 75 },
    ];
    
    for (const range of ranges) {
        const columnNumbers = new Set<number>();
        while (columnNumbers.size < 5) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            columnNumbers.add(num);
        }
        const nums = Array.from(columnNumbers);
        for (let row = 0; row < 5; row++) {
            if (range.col === 2 && row === 2) { // Free space
                card[row][range.col] = 0;
            } else {
                card[row][range.col] = nums[row];
            }
        }
    }
    return card.flat();
};


export const calculateCardProgress = (numbers: number[], drawnNumbers: number[]): { isBingo: boolean, numbersToWin: number } => {
    // Reconstruct the 2D card from the flat array for easier bingo logic
    const card: number[][] = [];
    for (let i = 0; i < 5; i++) {
        card.push(numbers.slice(i * 5, i * 5 + 5));
    }

    let isBingo = false;
    let numbersToWin = 5; // The most numbers needed for any single line

    const isMarked = (num: number) => {
        if (num === 0) return true; // Free space
        return drawnNumbers.includes(num);
    };

    // Check rows and columns
    for (let i = 0; i < 5; i++) {
        let rowNeeded = 0;
        let colNeeded = 0;
        for (let j = 0; j < 5; j++) {
            if (!isMarked(card[i][j])) rowNeeded++;
            if (!isMarked(card[j][i])) colNeeded++;
        }
        if (rowNeeded === 0) isBingo = true;
        if (colNeeded === 0) isBingo = true;
        numbersToWin = Math.min(numbersToWin, rowNeeded, colNeeded);
    }

    // Check diagonals
    let diag1Needed = 0;
    let diag2Needed = 0;
    for (let i = 0; i < 5; i++) {
        if (!isMarked(card[i][i])) diag1Needed++;
        if (!isMarked(card[i][4 - i])) diag2Needed++;
    }
    if (diag1Needed === 0) isBingo = true;
    if (diag2Needed === 0) isBingo = true;
    numbersToWin = Math.min(numbersToWin, diag1Needed, diag2Needed);

    return { isBingo, numbersToWin };
};