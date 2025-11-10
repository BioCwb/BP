import React, { useState } from 'react';
import { auth, EmailAuthProvider } from '../firebase/config';
// FIX: Removed v9 modular auth imports to switch to v8 compat syntax.
import type firebase from 'firebase/compat/app';
import { InputField } from './InputField';
import { UserIcon } from './icons/UserIcon';
import { LockIcon } from './icons/LockIcon';
import { useNotification } from '../context/NotificationContext';

interface ProfileManagementProps {
  user: firebase.User;
  onBack: () => void;
}

export const ProfileManagement: React.FC<ProfileManagementProps> = ({ user, onBack }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const { showNotification } = useNotification();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (displayName === user.displayName) {
        showNotification('Você não alterou seu nome de usuário.', 'error');
        return;
    }
    
    if (!auth.currentUser) return;

    try {
      // FIX: Switched from v9 updateProfile(user, ...) to v8 user.updateProfile(...)
      await auth.currentUser.updateProfile({ displayName });
      showNotification('Perfil atualizado com sucesso!', 'success');
    } catch (err) {
      showNotification('Falha ao atualizar o perfil. Por favor, tente novamente.', 'error');
    }
  };
  
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showNotification('Por favor, preencha todos os campos de senha.', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showNotification('As novas senhas não coincidem.', 'error');
      return;
    }
    if (!auth.currentUser || !auth.currentUser.email) {
      showNotification('Não foi possível encontrar informações do usuário.', 'error');
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      // FIX: Switched from v9 reauthenticateWithCredential(user, ...) to v8 user.reauthenticateWithCredential(...)
      await auth.currentUser.reauthenticateWithCredential(credential);
      // FIX: Switched from v9 updatePassword(user, ...) to v8 user.updatePassword(...)
      await auth.currentUser.updatePassword(newPassword);

      showNotification('Senha alterada com sucesso!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') {
        showNotification('Senha atual incorreta.', 'error');
      } else if (err.code === 'auth/weak-password') {
         showNotification('A senha deve ter pelo menos 6 caracteres.', 'error');
      }
      else {
        showNotification('Falha ao alterar a senha. Por favor, tente novamente.', 'error');
        console.error(err);
      }
    }
  };
  
  const isEmailProvider = user.providerData.some(p => p.providerId === 'password');

  return (
    <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-white">Gerenciar Perfil</h2>
        <button onClick={onBack} className="text-gray-300 hover:text-white">&larr; Voltar para o Lobby</button>
      </div>

      <form onSubmit={handleProfileUpdate} className="space-y-4 border-b border-gray-700 pb-6 mb-6">
        <InputField
          id="display-name"
          label="Nome de usuário"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Escolha um nome de usuário"
          icon={<UserIcon className="w-5 h-5 text-gray-400" />}
        />
        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
        >
          Salvar Nome de Usuário
        </button>
      </form>
      
      {isEmailProvider ? (
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <h3 className="text-xl font-semibold text-white text-center">Mudar Senha</h3>
           <InputField
            id="current-password"
            label="Senha Atual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Digite sua senha atual"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
           <InputField
            id="new-password"
            label="Nova Senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Digite sua nova senha"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
           <InputField
            id="confirm-new-password"
            label="Confirmar Nova Senha"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Confirme sua nova senha"
            icon={<LockIcon className="w-5 h-5 text-gray-400" />}
          />
          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Atualizar Senha
          </button>
        </form>
      ) : (
        <div className="text-center text-gray-400">
            O gerenciamento de senha não está disponível para contas conectadas com o Google.
        </div>
      )}
    </div>
  );
};
