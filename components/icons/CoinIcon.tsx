import React from 'react';

export const CoinIcon = ({ className }: { className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={className} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor" 
        strokeWidth="2"
    >
        <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V5m0 20v-1m0-18a9 9 0 100 18 9 9 0 000-18z" 
        />
    </svg>
);
