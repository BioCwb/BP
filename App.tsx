import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db } from './firebase/config';
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
import { useLanguage } from './context/LanguageContext';

type AuthMode = 'login' | 'register';
type ViewMode = 'auth' | 'lobby' | 'game' | 'profile';

export interface UserData {
  displayName: string;
  email: string;
  fichas: number;
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
    className={`w-1/2 py-3 text-center font-semibold transition-colors duration-300 focus:outline-none ${currentMode === mode ? 'text-white border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'}`}
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
  const { t } = useLanguage();

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  
  // Verification State
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [needsVerification, setNeedsVerification] = useState<firebase.User | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent'>('idle');

  const handleTabChange = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
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
                fichas: 100 // Welcome bonus
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
    // FIX: Switched from v9 signOut(auth) to v8 auth.signOut()
    await auth.signOut();
  };
  
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
          setError(t('error.profileLoad'));
          handleLogout(); // Log out on critical data fetch failure
      });
      return () => unsubscribe();
    }
  }, [currentUser?.uid, t]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmail || !loginPassword) {
      setError(t('error.fillAllFields'));
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
      setError(t('error.invalidCredentials'));
    }
  };
  
  const handleGoogleSignIn = async () => {
    setError(null);
    setNeedsVerification(null);
    setShowVerificationMessage(false);
    try {
        // FIX: Switched from v9 signInWithPopup(auth, ...) to v8 auth.signInWithPopup(...)
        await auth.signInWithPopup(googleProvider);
    } catch (err: any) {
        if (err.code !== 'auth/popup-closed-by-user') {
            setError(t('error.googleSignInFailed'));
            console.error(err);
        }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!registerUsername || !registerEmail || !registerPassword || !registerConfirmPassword) {
      setError(t('error.fillAllFields'));
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError(t('error.passwordsDoNotMatch'));
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
          fichas: 100 // Welcome bonus
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
          setError(t('error.emailInUse'));
        } else if (err.code === 'auth/weak-password') {
          setError(t('error.weakPassword'));
        } else {
          setError(t('error.accountCreationFailed'));
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
        setError(t('error.resendVerificationFailed'));
    }
  };

  
  const renderVerificationView = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">{t('verify.title')}</h2>
        <p className="text-gray-300 mb-6">{t('verify.checkInbox')} <strong className="text-white">{needsVerification?.email}</strong> {t('verify.clickLink')}</p>
        <div className="space-y-4">
            <button onClick={handleResendVerification} disabled={resendStatus === 'sent'} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed">
                {resendStatus === 'sent' ? t('verify.sent') : t('verify.resend')}
            </button>
            <button onClick={() => setNeedsVerification(null)} className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-semibold">
                {t('verify.backToLogin')}
            </button>
        </div>
        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
      </div>
  );
  
  const renderPostRegistrationView = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">{t('register.successTitle')}</h2>
        <p className="text-gray-300 mb-6">{t('register.successMessage')}</p>
        <button onClick={() => setShowVerificationMessage(false)} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold">
            {t('register.gotIt')}
        </button>
      </div>
  );
  
  const renderAuthForms = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
            <div className="flex">
              <TabButton mode="login" currentMode={authMode} onClick={handleTabChange}>{t('login.title')}</TabButton>
              <TabButton mode="register" currentMode={authMode} onClick={handleTabChange}>{t('register.title')}</TabButton>
            </div>
            <div className="p-8">
              {authMode === 'login' ? (
                <>
                  <AuthForm title="auth.welcome" onSubmit={handleLoginSubmit} buttonText="login.title">
                    <InputField id="login-email" label="auth.email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="auth.emailPlaceholder" icon={<EmailIcon />} />
                    <InputField id="login-password" label="auth.password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="auth.passwordPlaceholder" icon={<LockIcon />} />
                  </AuthForm>
                  <div className="relative flex py-5 items-center">
                    <div className="flex-grow border-t border-gray-600"></div>
                    <span className="flex-shrink mx-4 text-gray-400 text-sm">{t('auth.or')}</span>
                    <div className="flex-grow border-t border-gray-600"></div>
                  </div>
                  <button onClick={handleGoogleSignIn} aria-label="Sign in with Google" className="w-full flex items-center justify-center py-2.5 px-4 bg-white hover:bg-gray-200 rounded-lg text-gray-700 font-semibold transition-colors duration-300 shadow-md">
                    <GoogleIcon className="w-5 h-5 mr-3" />
                    {t('auth.signInWithGoogle')}
                  </button>
                </>
              ) : (
                <AuthForm title="auth.createAccount" onSubmit={handleRegisterSubmit} buttonText="register.title">
                  <InputField id="register-username" label="auth.username" type="text" value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} placeholder="auth.usernamePlaceholder" icon={<UserIcon />} />
                  <InputField id="register-email" label="auth.email" type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="auth.emailPlaceholder" icon={<EmailIcon />} />
                  <InputField id="register-password" label="auth.password" type="password" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} placeholder="auth.createPasswordPlaceholder" icon={<LockIcon />} />
                  <InputField id="register-confirm-password" label="auth.confirmPassword" type="password" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} placeholder="auth.confirmPasswordPlaceholder" icon={<LockIcon />} />
                </AuthForm>
              )}
              {error && (<p className="mt-4 text-center text-red-400 bg-red-900 bg-opacity-50 p-3 rounded-lg">{error}</p>)}
            </div>
          </div>
  );

  const renderContent = () => {
    if (loading || (currentUser && !userData)) {
      return (
        <div className="text-white text-2xl">{t('loading')}...</div>
      );
    }
    
    switch (viewMode) {
        case 'lobby':
            return <GameLobby userData={userData!} onPlay={() => setViewMode('game')} onManageProfile={() => setViewMode('profile')} onLogout={handleLogout} />;
        case 'game':
            return <BingoGame user={currentUser!} userData={userData!} onBackToLobby={() => setViewMode('lobby')} />;
        case 'profile':
            return <ProfileManagement user={currentUser!} onBack={() => setViewMode('lobby')} />;
        case 'auth':
            if (needsVerification) return renderVerificationView();
            if (showVerificationMessage) return renderPostRegistrationView();
            return renderAuthForms();
        default:
             return renderAuthForms();
    }
  }

  const appContainerClasses = `min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-white flex flex-col items-center ${viewMode === 'game' ? '' : 'justify-center p-4'}`;

  return (
    <div className={appContainerClasses}>
        {viewMode === 'auth' && !showVerificationMessage && !needsVerification && (
            <div className="text-center mb-8">
                <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">{t('app.title')}</h1>
                <p className="mt-4 text-lg text-gray-300">{t('app.subtitle')}</p>
            </div>
        )}
        {renderContent()}
    </div>
  );
}