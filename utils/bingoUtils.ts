
export const calculateCardProgress = (numbers: number[][], drawnNumbers: number[]): { isBingo: boolean, numbersToWin: number } => {
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
            if (!isMarked(numbers[i][j])) rowNeeded++;
            if (!isMarked(numbers[j][i])) colNeeded++;
        }
        if (rowNeeded === 0) isBingo = true;
        if (colNeeded === 0) isBingo = true;
        numbersToWin = Math.min(numbersToWin, rowNeeded, colNeeded);
    }

    // Check diagonals
    let diag1Needed = 0;
    let diag2Needed = 0;
    for (let i = 0; i < 5; i++) {
        if (!isMarked(numbers[i][i])) diag1Needed++;
        if (!isMarked(numbers[i][4 - i])) diag2Needed++;
    }
    if (diag1Needed === 0) isBingo = true;
    if (diag2Needed === 0) isBingo = true;
    numbersToWin = Math.min(numbersToWin, diag1Needed, diag2Needed);

    return { isBingo, numbersToWin };
};
