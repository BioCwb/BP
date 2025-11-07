import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';

interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default the language to Portuguese and remove the ability to change it.
  const [language] = useState('pt-BR');
  const [translations, setTranslations] = useState<any | null>(null);

  useEffect(() => {
    fetch('/locales/pt-BR.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setTranslations(data))
      .catch(error => console.error("Failed to load translations:", error));
  }, []);

  // setLanguage is now a no-op to prevent errors in any component that might still call it.
  const setLanguage = () => {};

  const t = useMemo(() => (key: string, replacements?: { [key: string]: string | number }): string => {
    // Return key or loading indicator while translations are being fetched
    if (!translations) {
      return key;
    }
    
    // Traverse nested keys (e.g., 'error.maxCards')
    const keys = key.split('.');
    let translation = keys.reduce((acc: any, currentKey: string) => {
        return acc && acc[currentKey] !== undefined ? acc[currentKey] : undefined;
    }, translations);

    // If translation not found, return the key itself as a fallback
    if (translation === undefined) {
        translation = key;
    }

    if (replacements && typeof translation === 'string') {
        Object.keys(replacements).forEach((placeholder) => {
            const regex = new RegExp(`{${placeholder}}`, 'g');
            translation = translation.replace(regex, String(replacements[placeholder]));
        });
    }

    return String(translation);
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