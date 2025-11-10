import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db, serverTimestamp } from './firebase/config';
// FIX: Removed firebase v9 modular imports as they are not compatible with the project setup, causing "no exported member" errors.
// The functions are now called using the v8 syntax (e.g., auth.onAuthStateChanged).
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


type AuthMode = 'login' | 'register';
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
}

// FIX: Moved TabButton component outside of the App component to prevent re-definition on each render
// and to resolve a potential TypeScript type inference issue causing the 'children' prop error.
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
  // FIX: Renamed the state setter from setRegisterPassword to setRegisterConfirmPassword to avoid redeclaring the same variable.
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

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
    // FIX: Switched from v9 onAuthStateChanged(auth, ...) to v8 auth.onAuthStateChanged(...)
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user && (user.emailVerified || user.providerData.some(p => p.providerId !== 'password'))) {
        setCurrentUser(user);
        
        // FIX: Switched from v9 doc(db, ...) to v8 db.collection(...).doc(...)
        const userDocRef = db.collection("users").doc(user.uid);
        // FIX: Switched from v9 getDoc(...) to v8 userDocRef.get()
        const docSnap = await userDocRef.get();
        // FIX: Switched from v9 docSnap.exists() to v8 docSnap.exists
        if (!docSnap.exists) {
             const newUserData: UserData = {
                displayName: user.displayName || 'BingoPlayer',
                email: user.email!,
                fichas: 100, // Welcome bonus
                gamesPlayed: 0,
                cardsPurchased: 0,
                totalWinnings: 0,
            };
            // FIX: Switched from v9 setDoc(...) to v8 userDocRef.set(...)
            await userDocRef.set(newUserData);
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
    // FIX: Switched from v9 signOut(auth) to v8 auth.signOut()
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
      // FIX: Switched from v9 doc(db, ...) to v8 db.collection(...).doc(...)
      const userDocRef = db.collection("users").doc(currentUser.uid);
      // FIX: Switched from v9 onSnapshot(...) to v8 userDocRef.onSnapshot(...)
      const unsubscribe = userDocRef.onSnapshot((doc) => {
        // FIX: Switched from v9 doc.exists() to v8 doc.exists
        if (doc.exists) {
          setUserData(doc.data() as UserData);
        }
      }, (err) => {
          console.error("Error fetching user data:", err);
          showNotification('Falha ao carregar seu perfil. Verifique sua conexão e desative bloqueadores de anúncio. Você foi desconectado.', 'error');
          handleLogout(); // Log out on critical data fetch failure
      });
      return () => unsubscribe();
    }
  }, [currentUser?.uid, showNotification]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      showNotification('Por favor, preencha todos os campos.', 'error');
      return;
    }
    try {
      // FIX: Switched from v9 signInWithEmailAndPassword(auth, ...) to v8 auth.signInWithEmailAndPassword(...)
      const userCredential = await auth.signInWithEmailAndPassword(loginEmail, loginPassword);
      if (userCredential.user && !userCredential.user.emailVerified) {
        setNeedsVerification(userCredential.user);
        // FIX: Switched from v9 signOut(auth) to v8 auth.signOut()
        await auth.signOut();
      }
    } catch (err: any) {
      showNotification('E-mail ou senha inválidos.', 'error');
    }
  };
  
  const handleGoogleSignIn = async () => {
    setNeedsVerification(null);
    setShowVerificationMessage(false);
    try {
        // FIX: Switched from v9 signInWithPopup(auth, ...) to v8 auth.signInWithPopup(...)
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
      // FIX: Switched from v9 createUserWithEmailAndPassword(auth, ...) to v8 auth.createUserWithEmailAndPassword(...)
      const userCredential = await auth.createUserWithEmailAndPassword(registerEmail, registerPassword);
      const user = userCredential.user;
      
      if (user) {
        // FIX: Switched from v9 updateProfile(user, ...) to v8 user.updateProfile(...)
        await user.updateProfile({ displayName: registerUsername });
        
        const newUserData: UserData = {
          displayName: registerUsername,
          email: registerEmail,
          fichas: 100, // Welcome bonus
          gamesPlayed: 0,
          cardsPurchased: 0,
          totalWinnings: 0,
        };
        // FIX: Switched from v9 setDoc(doc(db,...),...) to v8 db.collection(...).doc(...).set(...)
        await db.collection("users").doc(user.uid).set(newUserData);
        
        // FIX: Switched from v9 sendEmailVerification(user) to v8 user.sendEmailVerification()
        await user.sendEmailVerification();
      }
      
      // FIX: Switched from v9 signOut(auth) to v8 auth.signOut()
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
        // FIX: Switched from v9 sendEmailVerification(user) to v8 user.sendEmailVerification()
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
  
  const renderAuthForms = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
            <div className="flex">
              <TabButton mode="login" currentMode={authMode} onClick={handleTabChange}>Entrar</TabButton>
              <TabButton mode="register" currentMode={authMode} onClick={handleTabChange}>Registrar</TabButton>
            </div>
            <div className="p-6 sm:p-8">
              {authMode === 'login' ? (
                <>
                  <AuthForm title="Bem-vindo de volta!" onSubmit={handleLoginSubmit} buttonText="Entrar">
                    <InputField id="login-email" label="E-mail" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Digite seu e-mail" icon={<EmailIcon />} />
                    <InputField id="login-password" label="Senha" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Digite sua senha" icon={<LockIcon />} />
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
              ) : (
                <AuthForm title="Criar Conta" onSubmit={handleRegisterSubmit} buttonText="Registrar">
                  <InputField id="register-username" label="Nome de usuário" type="text" value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} placeholder="Escolha um nome de usuário" icon={<UserIcon />} />
                  <InputField id="register-email" label="E-mail" type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="Digite seu e-mail" icon={<EmailIcon />} />
                  <InputField id="register-password" label="Senha" type="password" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} placeholder="Crie uma senha" icon={<LockIcon />} />
                  {/* FIX: Used the correct state setter 'setRegisterConfirmPassword' for the confirm password field. */}
                  <InputField id="register-confirm-password" label="Confirmar Senha" type="password" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} placeholder="Confirme sua senha" icon={<LockIcon />} />
                </AuthForm>
              )}
            </div>
          </div>
  );

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
            Versão: 1.0.19
        </footer>
    </div>
  );
}