import React from 'react';
import { UserIcon } from './icons/UserIcon';

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'md', online }) => {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
  };

  const iconSizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }
  
  const onlineStatusClasses = online === true ? 'border-green-500' : online === false ? 'border-red-500' : 'border-gray-500';

  const baseClasses = `relative rounded-full flex-shrink-0 flex items-center justify-center bg-gray-600 object-cover border-2`;

  return (
    <div className={`${baseClasses} ${sizeClasses[size]} ${onlineStatusClasses}`}>
      {src ? (
        <img src={src} alt={alt} className="rounded-full w-full h-full object-cover" />
      ) : (
        <UserIcon className={`${iconSizeClasses[size]} text-gray-400`} />
      )}
    </div>
  );
};
