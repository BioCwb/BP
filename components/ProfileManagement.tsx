import React, { useState } from 'react';
import { auth, EmailAuthProvider, db } from '../firebase/config';
// FIX: Removed v9 modular auth imports to switch to v8 compat syntax.
import type firebase from 'firebase/compat/app';
import { InputField } from './InputField';
import { UserIcon } from './icons/UserIcon';
import { LockIcon } from './icons/LockIcon';
import { useNotification } from '../context/NotificationContext';
import { type UserData } from '../App';
import { PlayIcon } from './icons/PlayIcon';
import { TicketIcon } from './icons/TicketIcon';
import { TrophyIcon } from './icons/TrophyIcon';
import { KeyIcon } from './icons/KeyIcon';


interface ProfileManagementProps {
  user: firebase.User;
  userData: UserData;
  onBack: () => void;
}

export const ProfileManagement: React.FC<ProfileManagementProps> = ({ user, userData, onBack }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const { showNotification } = useNotification();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [pixKeyType, setPixKeyType] = useState(userData.pixKeyType || 'cpf');
  const [pixKey, setPixKey] = useState(userData.pixKey || '');
  const [fullName, setFullName] = useState(userData.fullName || '');

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

  const handlePixInfoUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
        const userDocRef = db.collection('users').doc(auth.currentUser.uid);
        await userDocRef.update({
            pixKeyType,
            pixKey,
            fullName
        });
        showNotification('Informações de premiação salvas!', 'success');
    } catch (err) {
        showNotification('Falha ao salvar as informações de premiação.', 'error');
    }
  };
  
  const isEmailProvider = user.providerData.some(p => p.providerId === 'password');

  return (
    <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-white">Gerenciar Perfil</h2>
        <button onClick={onBack} className="text-gray-300 hover:text-white">&larr; Voltar para o Lobby</button>
      </div>

      <div className="border-b border-gray-700 pb-6 mb-6">
        <h3 className="text-xl font-semibold text-white text-center mb-4">Estatísticas do Jogador</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-lg">
            <span className="flex items-center text-gray-300"><PlayIcon className="w-5 h-5 mr-2 text-purple-400" /> Partidas Jogadas:</span>
            <span className="font-bold text-white">{userData.gamesPlayed ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-lg">
            <span className="flex items-center text-gray-300"><TicketIcon className="w-5 h-5 mr-2 text-green-400" /> Cartelas Compradas:</span>
            <span className="font-bold text-white">{userData.cardsPurchased ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-lg">
            <span className="flex items-center text-gray-300"><TrophyIcon className="w-5 h-5 mr-2 text-yellow-400" /> Fichas Ganhas (Total):</span>
            <span className="font-bold text-white">{userData.totalWinnings ?? 0}</span>
          </div>
        </div>
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

      <div className="border-t border-gray-700 pt-6 mt-6">
        <form onSubmit={handlePixInfoUpdate} className="space-y-4">
            <h3 className="text-xl font-semibold text-white text-center">Informações para Premiação (PIX)</h3>
            <p className="text-sm text-center text-gray-400 mb-4">
                Esses dados são confidenciais e serão usados apenas para o pagamento de prêmios.
            </p>
            <div>
                <label htmlFor="pix-key-type" className="block text-sm font-medium text-gray-300 mb-1">
                    Tipo de Chave Pix
                </label>
                <select
                    id="pix-key-type"
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value)}
                    className="w-full py-2.5 pl-4 pr-10 bg-gray-700 bg-opacity-50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-300"
                >
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="celular">Celular</option>
                    <option value="email">E-mail</option>
                    <option value="aleatoria">Aleatória</option>
                </select>
            </div>
            <InputField
                id="pix-key"
                label="Chave Pix"
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Digite sua chave Pix"
                icon={<KeyIcon className="w-5 h-5 text-gray-400" />}
            />
            <InputField
                id="full-name"
                label="Nome Completo do Titular"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome completo como no banco"
                icon={<UserIcon className="w-5 h-5 text-gray-400" />}
            />
            <button
                type="submit"
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            >
                Salvar Informações de Premiação
            </button>
        </form>
      </div>

    </div>
  );
};