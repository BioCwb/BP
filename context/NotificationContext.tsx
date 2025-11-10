import React, { createContext, useState, useContext, useCallback } from 'react';

type NotificationType = 'success' | 'error' | 'info';

interface NotificationState {
  message: string;
  type: NotificationType;
  isVisible: boolean;
}

interface NotificationContextValue extends NotificationState {
  showNotification: (message: string, type?: NotificationType) => void;
  hideNotification: () => void;
}

interface NotificationHook {
    showNotification: (message: string, type?: NotificationType) => void;
    hideNotification: () => void;
}


const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: 'info',
    isVisible: false,
  });
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, isVisible: false }));
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
  }, [timeoutId]);

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setNotification({ message, type, isVisible: true });
    const newTimeoutId = setTimeout(() => {
      hideNotification();
    }, 5000); // Auto-hide after 5 seconds
    setTimeoutId(newTimeoutId);
  }, [hideNotification, timeoutId]);

  const value = { ...notification, showNotification, hideNotification };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationHook => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return { showNotification: context.showNotification, hideNotification: context.hideNotification };
};

export const useNotificationState = (): NotificationState & { hideNotification: () => void } => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotificationState must be used within a NotificationProvider');
    }
    return {
        isVisible: context.isVisible,
        message: context.message,
        type: context.type,
        hideNotification: context.hideNotification,
    };
};
