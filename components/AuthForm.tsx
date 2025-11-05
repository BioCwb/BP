
import React from 'react';

interface AuthFormProps {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  buttonText: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({ title, onSubmit, children, buttonText }) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <h2 className="text-3xl font-bold text-center text-white">{title}</h2>
      <div className="space-y-4">
        {children}
      </div>
      <button
        type="submit"
        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
      >
        {buttonText}
      </button>
    </form>
  );
};
