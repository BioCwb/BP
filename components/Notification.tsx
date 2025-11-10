import React from 'react';
import { useNotificationState } from '../context/NotificationContext';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { InfoIcon } from './icons/InfoIcon';

export const Notification: React.FC = () => {
  const { isVisible, message, type, hideNotification } = useNotificationState();

  if (!isVisible) {
    return null;
  }

  const baseClasses = "fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center p-4 w-full max-w-md rounded-lg shadow-lg transition-all duration-300 transform";
  const typeClasses = {
    success: 'bg-green-600 text-white border-green-400',
    error: 'bg-red-600 text-white border-red-400',
    info: 'bg-blue-600 text-white border-blue-400',
  };

  const icon = {
    success: <CheckCircleIcon className="w-6 h-6" />,
    error: <XCircleIcon className="w-6 h-6" />,
    info: <InfoIcon className="w-6 h-6" />,
  };

  return (
    <div
      className={`${baseClasses} ${typeClasses[type]} ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'}`}
      role="alert"
    >
      <div className="mr-3">
        {icon[type]}
      </div>
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg inline-flex h-8 w-8 text-white/70 hover:text-white hover:bg-white/20 focus:ring-2 focus:ring-white/50"
        onClick={hideNotification}
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
      </button>
    </div>
  );
};
