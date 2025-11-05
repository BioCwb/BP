
import React, { useState } from 'react';
import { auth, EmailAuthProvider } from '../firebase/config';
// FIX: Removed v9 modular auth imports to switch to v8 compat syntax.
import type firebase from 'firebase/compat/app';
import { InputField } from './InputField';
import { UserIcon } from './icons/UserIcon';
import { LockIcon } from './icons/LockIcon';

interface ProfileManagementProps {
  user: firebase.User;
  onBack: () => void;
}

export const ProfileManagement: React.FC<ProfileManagementProps> = ({ user, onBack }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (displayName === user.displayName) {
        setError("You haven't changed your username.");
        return;
    }
    
    if (!auth.currentUser) return;

    try {
      // FIX: Switched from v9 updateProfile(user, ...) to v8 user.updateProfile(...)
      await auth.currentUser.updateProfile({ displayName });
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    }
  };
  
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (!auth.currentUser || !auth.currentUser.email) {
      setPasswordError('Could not find user information.');
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      // FIX: Switched from v9 reauthenticateWithCredential(user, ...) to v8 user.reauthenticateWithCredential(...)
      await auth.currentUser.reauthenticateWithCredential(credential);
      // FIX: Switched from v9 updatePassword(user, ...) to v8 user.updatePassword(...)
      await auth.currentUser.updatePassword(newPassword);

      setPasswordSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') {
        setPasswordError('Incorrect current password.');
      } else if (err.code === 'auth/weak-password') {
         setPasswordError('New password should be at least 6 characters.');
      }
      else {
        setPasswordError('Failed to change password. Please try again.');
        console.error(err);
      }
    }
  };
  
  const isEmailProvider = user.providerData.some(p => p.providerId === 'password');

  return (
    <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-white">Manage Profile</h2>
        <button onClick={onBack} className="text-gray-300 hover:text-white transition-colors">&larr; Back to Lobby</button>
      </div>

      <form onSubmit={handleProfileUpdate} className="space-y-4 border-b border-gray-700 pb-6 mb-6">
        <InputField
          id="display-name"
          label="Username"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your new username"
          icon={<UserIcon className="w-5 h-5 text-gray-400" />}
        />
        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
        >
          Save Username
        </button>
        {error && <p className="text-center text-red-400">{error}</p>}
        {success && <p className="text-center text-green-400">{success}</p>}
      </form>
      
      {isEmailProvider ? (
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <h3 className="text-xl font-semibold text-white text-center">Change Password</h3>
           <InputField
            id="current-password"
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
           <InputField
            id="new-password"
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter your new password"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
           <InputField
            id="confirm-new-password"
            label="Confirm New Password"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Confirm your new password"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Update Password
          </button>
           {passwordError && <p className="text-center text-red-400">{passwordError}</p>}
          {passwordSuccess && <p className="text-center text-green-400">{passwordSuccess}</p>}
        </form>
      ) : (
        <div className="text-center text-gray-400">
            Password management is not available for accounts signed in with Google.
        </div>
      )}
    </div>
  );
};