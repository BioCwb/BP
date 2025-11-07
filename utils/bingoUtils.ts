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
    let numbersToWin = 0;
    for (const num of numbers) {
        // Count numbers on the card that have not been drawn yet (excluding the free space)
        if (num !== 0 && !drawnNumbers.includes(num)) {
            numbersToWin++;
        }
    }
    // A blackout bingo is achieved when there are no numbers left to be drawn.
    const isBingo = numbersToWin === 0;
    return { isBingo, numbersToWin };
};
