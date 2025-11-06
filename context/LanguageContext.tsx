import React, { createContext, useState, useContext, useMemo } from 'react';
import ptTranslations from '../locales/pt-BR.json';

interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default the language to Portuguese and remove the ability to change it.
  const [language] = useState('pt-BR');
  const [translations] = useState(ptTranslations);

  // setLanguage is now a no-op to prevent errors in any component that might still call it.
  const setLanguage = () => {};

  const t = useMemo(() => (key: string, replacements?: { [key: string]: string | number }): string => {
    let translation = (translations as any)[key] || key;

    if (replacements) {
        Object.keys(replacements).forEach((placeholder) => {
            const regex = new RegExp(`{${placeholder}}`, 'g');
            translation = translation.replace(regex, String(replacements[placeholder]));
        });
    }

    return translation;
  }, [translations]);

  const value = { language, setLanguage, t };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};