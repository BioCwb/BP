import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const languages = [
    { code: 'en-US', label: 'EN' },
    { code: 'pt-BR', label: 'PT' },
  ];

  return (
    <div className="flex justify-center items-center space-x-2">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-opacity-50
            ${language === lang.code
              ? 'bg-purple-600 text-white shadow-lg ring-purple-500'
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
            }
          `}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};