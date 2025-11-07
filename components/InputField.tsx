import React from 'react';

interface InputFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  icon?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({ id, label, type, value, onChange, placeholder, icon }) => {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required
          className={`w-full py-2.5 ${icon ? 'pl-10' : 'pl-4'} pr-4 bg-gray-700 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-300 shadow-sm`}
        />
      </div>
    </div>
  );
};
