import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db, serverTimestamp, rtdb } from './firebase/config';
import type firebase from 'firebase/compat/app';
import { AuthForm } from './components/AuthForm';
import { InputField } from './components/InputField';
import { UserIcon } from './components/icons/UserIcon';
import { LockIcon } from './components/icons/LockIcon';
import { EmailIcon } from './components/icons/EmailIcon';
import { GoogleIcon } from './components/icons/GoogleIcon';
import { ProfileManagement } from './components/ProfileManagement';
import { GameLobby } from './components/GameLobby';
import { BingoGame } from './components/BingoGame';
import { AdminPanel } from './components/AdminPanel';
import { useNotification } from './context/NotificationContext';
import { Notification } from './components/Notification';


type AuthMode = 'login' | 'register' | 'forgotPassword';
type ViewMode = 'auth' | 'lobby' | 'game' | 'profile' | 'admin' | 'spectator';

export interface UserData {
  displayName: string;
  email: string;
  fichas: number;
  lastBonusClaimedAt?: firebase.firestore.Timestamp;
  gamesPlayed: number;
  cardsPurchased: number;
  totalWinnings: number;
  pixKeyType?: string;
  pixKey?: string;
  fullName?: string;
  photoURL?: string;
}

interface TabButtonProps {
  mode: AuthMode;
  currentMode: AuthMode;
  onClick: (mode: AuthMode) => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ mode, currentMode, onClick, children }) => (
  <button
    onClick={() => onClick(mode)}
    className={`w-1/2 py-3 text-center font-semibold transition-all duration-300 focus:outline-none ${currentMode === mode ? 'text-white border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'}`}
  >
    {children}
  </button>
);


export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [currentUser, setCurrentUser] = useState<firebase.User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('auth');

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  
  // Forgot Password State
  const [resetEmail, setResetEmail] = useState('');

  const { showNotification } = useNotification();
  
  // Verification State
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [needsVerification, setNeedsVerification] = useState<firebase.User | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent'>('idle');

  const handleTabChange = (mode: AuthMode) => {
    setAuthMode(mode);
    setShowVerificationMessage(false);
    setNeedsVerification(null);
  };


  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user && (user.emailVerified || user.providerData.some(p => p.providerId !== 'password'))) {
        setCurrentUser(user);
        
        const userDocRef = db.collection("users").doc(user.uid);
        const docSnap = await userDocRef.get();
        if (!docSnap.exists) {
             const newUserData: UserData = {
                displayName: user.displayName || 'BingoPlayer',
                email: user.email!,
                photoURL: user.photoURL || '',
                fichas: 100, // Welcome bonus
                gamesPlayed: 0,
                cardsPurchased: 0,
                totalWinnings: 0,
            };
            const { photoURL, ...firestoreData } = newUserData;
            await userDocRef.set(firestoreData);
            await rtdb.ref(`users/${user.uid}`).set({ photoURL });
        }
        
        setViewMode('lobby');
        setNeedsVerification(null);
      } else {
        setCurrentUser(null);
        setUserData(null);
        setViewMode('auth');
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);
  
  const handleLogout = async () => {
    if (auth.currentUser) {
      await db.collection('player_status').doc(auth.currentUser.uid).delete().catch(err => console.error("Failed to clear player status on logout:", err));
    }
    await auth.signOut();
  };

  // Player Presence Heartbeat
  useEffect(() => {
    if (!currentUser) return;

    // Set initial online status
    const statusRef = db.collection('player_status').doc(currentUser.uid);
    statusRef.set({ lastSeen: serverTimestamp() });

    const heartbeat = setInterval(() => {
        statusRef.set({ lastSeen: serverTimestamp() });
    }, 15000); // Update every 15 seconds

    return () => clearInterval(heartbeat);
  }, [currentUser]);
  
  useEffect(() => {
    if (currentUser?.uid) {
      const userDocRef = db.collection("users").doc(currentUser.uid);
      const userRtdbRef = rtdb.ref(`users/${currentUser.uid}/photoURL`);
      
      const unsubscribeFirestore = userDocRef.onSnapshot((doc) => {
        if (doc.exists) {
          setUserData(doc.data() as UserData);
        }
      }, (err) => {
          console.error("Error fetching user data:", err);
          showNotification('Falha ao carregar seu perfil. Verifique sua conexão e desative bloqueadores de anúncio. Você foi desconectado.', 'error');
          handleLogout(); // Log out on critical data fetch failure
      });

      const rtdbCallback = (snapshot: firebase.database.DataSnapshot) => {
          const photoURL = snapshot.val();
          if (photoURL !== undefined) {
              setUserData(prevData => {
                  const baseData = prevData || {} as UserData;
                  return { ...baseData, photoURL };
              });
          }
      };
      userRtdbRef.on('value', rtdbCallback);

      return () => {
          unsubscribeFirestore();
          userRtdbRef.off('value', rtdbCallback);
      };
    }
  }, [currentUser?.uid, showNotification]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      showNotification('Por favor, preencha todos os campos.', 'error');
      return;
    }
    try {
      const userCredential = await auth.signInWithEmailAndPassword(loginEmail, loginPassword);
      if (userCredential.user && !userCredential.user.emailVerified) {
        setNeedsVerification(userCredential.user);
        await auth.signOut();
      }
    } catch (err: any) {
      showNotification('E-mail ou senha inválidos.', 'error');
    }
  };
  
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      showNotification('Por favor, digite seu e-mail.', 'error');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(resetEmail);
      // For security, show a generic success message to prevent user enumeration attacks.
      showNotification('Se o e-mail estiver cadastrado, um link para redefinir a senha foi enviado.', 'success');
      setAuthMode('login');
      setResetEmail('');
    } catch (err: any) {
      console.error("Password reset error:", err);
      // Still show the generic message even if Firebase throws an error like 'auth/user-not-found'.
      showNotification('Se o e-mail estiver cadastrado, um link para redefinir a senha foi enviado.', 'success');
      setAuthMode('login');
    }
  };

  const handleGoogleSignIn = async () => {
    setNeedsVerification(null);
    setShowVerificationMessage(false);
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (err: any) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showNotification('Falha ao entrar com o Google. Por favor, tente novamente.', 'error');
            console.error(err);
        }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerUsername || !registerEmail || !registerPassword || !registerConfirmPassword) {
      showNotification('Por favor, preencha todos os campos.', 'error');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      showNotification('As senhas não coincidem.', 'error');
      return;
    }
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(registerEmail, registerPassword);
      const user = userCredential.user;
      
      if (user) {
        await user.updateProfile({ displayName: registerUsername });
        
        const newUserData: UserData = {
          displayName: registerUsername,
          email: registerEmail,
          photoURL: '',
          fichas: 100, // Welcome bonus
          gamesPlayed: 0,
          cardsPurchased: 0,
          totalWinnings: 0,
        };
        const { photoURL, ...firestoreData } = newUserData;
        await db.collection("users").doc(user.uid).set(firestoreData);
        await rtdb.ref(`users/${user.uid}`).set({ photoURL });
        
        await user.sendEmailVerification();
      }
      
      await auth.signOut();
      
      setShowVerificationMessage(true);
      setAuthMode('login');

    } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          showNotification('Este e-mail já está registrado.', 'error');
        } else if (err.code === 'auth/weak-password') {
          showNotification('A senha deve ter pelo menos 6 caracteres.', 'error');
        } else {
          showNotification('Falha ao criar uma conta. Por favor, tente novamente.', 'error');
        }
    }
  };

  // Effect to manage the timeout for resendStatus, ensuring it's cleaned up properly.
  useEffect(() => {
    if (resendStatus === 'sent') {
        const timer = setTimeout(() => {
            setResendStatus('idle');
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [resendStatus]);

  const handleResendVerification = async () => {
    if (!needsVerification) return;
    try {
        await needsVerification.sendEmailVerification();
        setResendStatus('sent');
    } catch (error) {
        showNotification('Falha ao reenviar o e-mail de verificação.', 'error');
    }
  };

  
  const renderVerificationView = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-6 sm:p-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Verifique seu E-mail</h2>
        <p className="text-gray-300 mb-6">Por favor, verifique sua caixa de entrada em <strong className="text-white">{needsVerification?.email}</strong> e clique no link de verificação.</p>
        <div className="space-y-4">
            <button onClick={handleResendVerification} disabled={resendStatus === 'sent'} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed">
                {resendStatus === 'sent' ? 'Verificação Enviada!' : 'Reenviar E-mail de Verificação'}
            </button>
            <button onClick={() => setNeedsVerification(null)} className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-semibold">
                Voltar para o Login
            </button>
        </div>
      </div>
  );
  
  const renderPostRegistrationView = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-6 sm:p-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Registro bem-sucedido!</h2>
        <p className="text-gray-300 mb-6">Um link de verificação foi enviado para o seu e-mail. Por favor, verifique sua caixa de entrada.</p>
        <button onClick={() => setShowVerificationMessage(false)} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold">
            Entendi, ir para o Login
        </button>
      </div>
  );
  
  const renderAuthForms = () => {
    let content;

    if (authMode === 'login') {
      content = (
        <>
          <AuthForm title="Bem-vindo de volta!" onSubmit={handleLoginSubmit} buttonText="Entrar">
            <InputField id="login-email" label="E-mail" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Digite seu e-mail" icon={<EmailIcon />} />
            <InputField id="login-password" label="Senha" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Digite sua senha" icon={<LockIcon />} />
            <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('forgotPassword')}
                  className="text-sm font-medium text-purple-400 hover:text-purple-300 focus:outline-none transition-colors duration-300"
                >
                  Esqueceu a senha?
                </button>
            </div>
          </AuthForm>
          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-gray-600"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-sm">Ou</span>
            <div className="flex-grow border-t border-gray-600"></div>
          </div>
          <button onClick={handleGoogleSignIn} aria-label="Sign in with Google" className="w-full flex items-center justify-center py-2.5 px-4 bg-white hover:bg-gray-200 rounded-lg text-gray-700 font-semibold transition-all duration-300 shadow-md">
            <GoogleIcon className="w-5 h-5 mr-3" />
            Entrar com o Google
          </button>
        </>
      );
    } else if (authMode === 'register') {
      content = (
        <AuthForm title="Criar Conta" onSubmit={handleRegisterSubmit} buttonText="Registrar">
          <InputField id="register-username" label="Nome de usuário" type="text" value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} placeholder="Escolha um nome de usuário" icon={<UserIcon />} />
          <InputField id="register-email" label="E-mail" type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="Digite seu e-mail" icon={<EmailIcon />} />
          <InputField id="register-password" label="Senha" type="password" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} placeholder="Crie uma senha" icon={<LockIcon />} />
          <InputField id="register-confirm-password" label="Confirmar Senha" type="password" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} placeholder="Confirme sua senha" icon={<LockIcon />} />
        </AuthForm>
      );
    } else { // authMode === 'forgotPassword'
        content = (
          <div>
            <AuthForm title="Redefinir Senha" onSubmit={handlePasswordReset} buttonText="Enviar Link">
              <p className="text-gray-300 text-sm text-center -mt-2 mb-4">
                  Digite seu e-mail e enviaremos um link para você voltar a acessar sua conta.
              </p>
              <InputField id="reset-email" label="E-mail" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="Digite seu e-mail de cadastro" icon={<EmailIcon />} />
            </AuthForm>
            <div className="text-center mt-4">
                <button type="button" onClick={() => setAuthMode('login')} className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors">
                    &larr; Voltar para o Login
                </button>
            </div>
          </div>
        );
    }


    return (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
        {authMode !== 'forgotPassword' && (
            <div className="flex">
              <TabButton mode="login" currentMode={authMode} onClick={handleTabChange}>Entrar</TabButton>
              <TabButton mode="register" currentMode={authMode} onClick={handleTabChange}>Registrar</TabButton>
            </div>
        )}
        <div className="p-6 sm:p-8">
          {content}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading || (currentUser && !userData)) {
      return (
        <div className="text-white text-2xl">Carregando...</div>
      );
    }
    
    switch (viewMode) {
        case 'lobby':
            return <GameLobby user={currentUser!} userData={userData!} onPlay={() => setViewMode('game')} onSpectate={() => setViewMode('spectator')} onManageProfile={() => setViewMode('profile')} onLogout={handleLogout} onGoToAdmin={() => setViewMode('admin')} />;
        case 'game':
            return <BingoGame user={currentUser!} userData={userData!} onBackToLobby={() => setViewMode('lobby')} onSessionReset={handleLogout} />;
        case 'spectator':
            return <BingoGame user={currentUser!} userData={userData!} onBackToLobby={() => setViewMode('lobby')} onSessionReset={handleLogout} isSpectator={true} />;
        case 'profile':
            return <ProfileManagement user={currentUser!} userData={userData!} onBack={() => setViewMode('lobby')} />;
        case 'admin':
            return <AdminPanel user={currentUser!} onBack={() => setViewMode('lobby')} />;
        case 'auth':
            if (needsVerification) return renderVerificationView();
            if (showVerificationMessage) return renderPostRegistrationView();
            return renderAuthForms();
        default:
             return renderAuthForms();
    }
  }

  const appContainerClasses = `min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-white flex flex-col items-center ${viewMode === 'game' || viewMode === 'spectator' ? '' : 'justify-center p-2 sm:p-4'}`;

  return (
    <div className={appContainerClasses}>
        <Notification />
        {viewMode === 'auth' && !showVerificationMessage && !needsVerification && (
            <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">NOITE DO BINGO</h1>
                <p className="mt-4 text-lg text-gray-300">Sua vez de ganhar!</p>
            </div>
        )}
        {renderContent()}
        <footer className="fixed bottom-0 right-0 p-2 text-xs text-gray-500">
            Versão: 1.0.23
        </footer>
    </div>
  );
}