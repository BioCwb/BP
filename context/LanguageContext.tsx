import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';

interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getInitialLanguage = () => {
    const savedLang = localStorage.getItem('bingo_language');
    if (savedLang && ['en-US', 'pt-BR'].includes(savedLang)) {
        return savedLang;
    }
    const browserLang = navigator.language || (navigator as any).userLanguage;
    return browserLang.startsWith('pt') ? 'pt-BR' : 'en-US';
  };

  const [language, setLanguage] = useState(getInitialLanguage);
  const [translations, setTranslations] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        const module = await import(`../locales/${language}.json`);
        setTranslations(module.default);
      } catch (error) {
        console.error(`Could not load translations for ${language}`, error);
        // Fallback to English if translations fail to load
        const fallbackModule = await import(`../locales/en-US.json`);
        setTranslations(fallbackModule.default);
      }
    };
    loadTranslations();
    localStorage.setItem('bingo_language', language);
  }, [language]);

  const t = useMemo(() => (key: string, replacements?: { [key: string]: string | number }): string => {
    let translation = translations[key] || key;

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