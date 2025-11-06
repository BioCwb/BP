// Helper function to generate a valid Bingo card as a flat array
export const generateBingoCard = (): number[] => {
    const card: number[][] = Array(5).fill(null).map(() => Array(5).fill(0));
    const ranges = [
        { col: 0, min: 1, max: 12 },
        { col: 1, min: 13, max: 24 },
        { col: 2, min: 25, max: 36 },
        { col: 3, min: 37, max: 48 },
        { col: 4, min: 49, max: 60 },
    ];
    
    for (const range of ranges) {
        const columnNumbers = new Set<number>();
        // The center column 'N' only needs 4 numbers because of the free space.
        const numbersToGenerate = range.col === 2 ? 4 : 5;
        while (columnNumbers.size < numbersToGenerate) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            columnNumbers.add(num);
        }
        
        let nums = Array.from(columnNumbers);

        for (let row = 0; row < 5; row++) {
            if (range.col === 2) { // Column 'N'
                if (row === 2) {
                    card[row][range.col] = 0; // Free space
                } else if (row < 2) {
                    card[row][range.col] = nums[row];
                } else { // row > 2
                    card[row][range.col] = nums[row - 1];
                }
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

// New function to check for a winning line based on player's manual marks
export const isWinningLine = (cardNumbers: number[], markedNumbers: number[], drawnNumbers: number[]): boolean => {
    const card: number[][] = [];
    for (let i = 0; i < 5; i++) {
        card.push(cardNumbers.slice(i * 5, i * 5 + 5));
    }

    const isMarkedByPlayer = (num: number) => {
        if (num === 0) return true; // Free space is always marked
        return markedNumbers.includes(num);
    };

    const checkLine = (line: number[]): boolean => {
        // Check 1: Does the player have all numbers in this line marked?
        const isLineComplete = line.every(isMarkedByPlayer);
        if (!isLineComplete) return false;

        // Security Check 2: Are all the numbers the player marked in this line *actually* in the official drawn numbers list?
        const allMarksAreValid = line.every(num => num === 0 || drawnNumbers.includes(num));
        return allMarksAreValid;
    }

    // Check rows
    for (let i = 0; i < 5; i++) {
        if (checkLine(card[i])) return true;
    }

    // Check columns
    for (let j = 0; j < 5; j++) {
        const column = card.map(row => row[j]);
        if (checkLine(column)) return true;
    }

    // Check diagonal (top-left to bottom-right)
    const diag1 = card.map((row, i) => row[i]);
    if (checkLine(diag1)) return true;

    // Check diagonal (top-right to bottom-left)
    const diag2 = card.map((row, i) => row[4 - i]);
    if (checkLine(diag2)) return true;

    return false;
};