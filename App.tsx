
import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from './firebase/config';
// FIX: Use Firebase v8 style type import for User and remove v9 function imports.
import type { User } from 'firebase';
import { AuthForm } from './components/AuthForm';
import { InputField } from './components/InputField';
import { UserIcon } from './components/icons/UserIcon';
import { LockIcon } from './components/icons/LockIcon';
import { EmailIcon } from './components/icons/EmailIcon';
import { GoogleIcon } from './components/icons/GoogleIcon';
import { ProfileManagement } from './components/ProfileManagement';

type AuthMode = 'login' | 'register';
type ViewMode = 'welcome' | 'profile';

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');

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
  const [needsVerification, setNeedsVerification] = useState<User | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent'>('idle');


  useEffect(() => {
    // FIX: Use v8 onAuthStateChanged method syntax.
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && (user.emailVerified || user.providerData.some(p => p.providerId !== 'password'))) {
        setCurrentUser(user);
        setNeedsVerification(null);
      } else {
        setCurrentUser(null);
      }
      if (!user) {
        setViewMode('welcome'); // Reset view on logout
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      // FIX: Use v8 signInWithEmailAndPassword method syntax.
      const userCredential = await auth.signInWithEmailAndPassword(loginEmail, loginPassword);
      if (userCredential.user && !userCredential.user.emailVerified) {
        setNeedsVerification(userCredential.user);
        // FIX: Use v8 signOut method syntax.
        await auth.signOut(); // Sign out the unverified user
      }
      // If verified, onAuthStateChanged will handle setting the user
    } catch (err: any) {
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          setError('Invalid email or password.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password.');
          break;
        default:
          setError('Failed to log in. Please try again.');
          break;
      }
    }
  };
  
  const handleGoogleSignIn = async () => {
    setError(null);
    setNeedsVerification(null);
    setShowVerificationMessage(false);
    try {
        // FIX: Use v8 signInWithPopup method syntax.
        await auth.signInWithPopup(googleProvider);
        // onAuthStateChanged will handle successful login
    } catch (err: any) {
        if (err.code !== 'auth/popup-closed-by-user') {
            setError('Failed to sign in with Google. Please try again.');
        }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!registerUsername || !registerEmail || !registerPassword || !registerConfirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      // FIX: Use v8 createUserWithEmailAndPassword method syntax.
      const userCredential = await auth.createUserWithEmailAndPassword(registerEmail, registerPassword);
      
      if (userCredential.user) {
        // FIX: Use v8 updateProfile method syntax.
        await userCredential.user.updateProfile({
          displayName: registerUsername
        });
        
        // FIX: Use v8 sendEmailVerification method syntax.
        await userCredential.user.sendEmailVerification();
      }
      
      // FIX: Use v8 signOut method syntax.
      await auth.signOut(); // Sign out until they verify
      
      // Reset form and show verification message
      setShowVerificationMessage(true);
      setRegisterUsername('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setAuthMode('login');

    } catch (err: any) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('This email is already registered.');
          break;
        case 'auth/weak-password':
          setError('Password should be at least 6 characters.');
          break;
        default:
          setError('Failed to create an account. Please try again.');
          break;
      }
    }
  };

  const handleResendVerification = async () => {
    if (!needsVerification) return;
    try {
        // FIX: Use v8 sendEmailVerification method syntax.
        await needsVerification.sendEmailVerification();
        setResendStatus('sent');
        setTimeout(() => setResendStatus('idle'), 5000); // Reset status after 5s
    } catch (error) {
        setError("Failed to resend verification email. Please try again later.");
    }
  };

  const handleLogout = async () => {
    try {
      // FIX: Use v8 signOut method syntax.
      await auth.signOut();
    } catch (error) {
      console.error("Error signing out: ", error);
      setError("Failed to log out.");
    }
  };

  const TabButton = ({ mode, children }: { mode: AuthMode; children: React.ReactNode }) => (
    <button
      onClick={() => {
        setAuthMode(mode);
        setError(null);
        setShowVerificationMessage(false);
        setNeedsVerification(null);
      }}
      className={`w-1/2 py-3 text-center font-semibold transition-colors duration-300 focus:outline-none ${
        authMode === mode
          ? 'text-white border-b-2 border-purple-500'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
  
  const renderLoggedInView = () => {
    if (!currentUser) return null;

    if (viewMode === 'profile') {
        return <ProfileManagement user={currentUser} onBack={() => setViewMode('welcome')} />;
    }

    return (
        <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center w-full max-w-md">
            <h2 className="text-3xl font-bold text-white">Welcome, {currentUser.displayName || currentUser.email}!</h2>
            <p className="text-gray-300 mt-2 mb-6">Ready to play?</p>
            <div className="space-y-4">
                 <button
                    onClick={() => setViewMode('profile')}
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
                 >
                    Manage Profile
                </button>
                <button
                    onClick={handleLogout}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                >
                    Logout
                </button>
            </div>
        </div>
    );
  };
  
  const renderVerificationView = () => {
    const email = needsVerification?.email;
    return (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Verify Your Email</h2>
        <p className="text-gray-300 mb-6">
          Please check your inbox at <strong className="text-white">{email}</strong> and click the verification link to continue.
        </p>
        <div className="space-y-4">
            <button
                onClick={handleResendVerification}
                disabled={resendStatus === 'sent'}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                {resendStatus === 'sent' ? 'Verification Sent!' : 'Resend Verification Email'}
            </button>
            <button
                onClick={() => setNeedsVerification(null)}
                className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-semibold transition-colors duration-300"
            >
                Back to Login
            </button>
        </div>
        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
      </div>
    );
  };
  
  const renderPostRegistrationView = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl p-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Registration Successful!</h2>
        <p className="text-gray-300 mb-6">
          A verification link has been sent to your email address. Please check your inbox to activate your account.
        </p>
        <button
            onClick={() => setShowVerificationMessage(false)}
            className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold transition-colors duration-300"
        >
            Got it, take me to Login
        </button>
      </div>
  );
  
  const renderAuthForms = () => (
      <div className="w-full max-w-md bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
            <div className="flex">
              <TabButton mode="login">Login</TabButton>
              <TabButton mode="register">Register</TabButton>
            </div>

            <div className="p-8">
              {authMode === 'login' ? (
                <>
                  <AuthForm title="Welcome Back!" onSubmit={handleLoginSubmit} buttonText="Login">
                    <InputField
                      id="login-email"
                      label="Email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter your email"
                      icon={<EmailIcon className="w-5 h-5 text-gray-400" />}
                    />
                    <InputField
                      id="login-password"
                      label="Password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      icon={<LockIcon className="w-5 h-5 text-gray-400" />}
                    />
                  </AuthForm>
                  <div className="relative flex py-5 items-center">
                    <div className="flex-grow border-t border-gray-600"></div>
                    <span className="flex-shrink mx-4 text-gray-400 text-sm">Or continue with</span>
                    <div className="flex-grow border-t border-gray-600"></div>
                  </div>
                  <button
                    onClick={handleGoogleSignIn}
                    aria-label="Sign in with Google"
                    className="w-full flex items-center justify-center py-2.5 px-4 bg-white hover:bg-gray-200 rounded-lg text-gray-700 font-semibold transition-colors duration-300 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                  >
                    <GoogleIcon className="w-5 h-5 mr-3" />
                    Sign in with Google
                  </button>
                </>
              ) : (
                <AuthForm title="Create Account" onSubmit={handleRegisterSubmit} buttonText="Register">
                  <InputField
                    id="register-username"
                    label="Username"
                    type="text"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    placeholder="Choose a username"
                    icon={<UserIcon className="w-5 h-5 text-gray-400" />}
                  />
                  <InputField
                    id="register-email"
                    label="Email"
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="Enter your email"
                    icon={<EmailIcon className="w-5 h-5 text-gray-400" />}
                  />
                  <InputField
                    id="register-password"
                    label="Password"
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="Create a password"
                    icon={<LockIcon className="w-5 h-5 text-gray-400" />}
                  />
                  <InputField
                    id="register-confirm-password"
                    label="Confirm Password"
                    type="password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    icon={<LockIcon className="w-5 h-5 text-gray-400" />}
                  />
                </AuthForm>
              )}
              {error && (
                <p className="mt-4 text-center text-red-400 bg-red-900 bg-opacity-50 p-3 rounded-lg">{error}</p>
              )}
            </div>
          </div>
  );


  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center">
        <p className="text-white text-2xl">Loading...</p>
      </div>
    );
  }
  
  const renderContent = () => {
    if (currentUser) {
        return renderLoggedInView();
    }
    if (needsVerification) {
        return renderVerificationView();
    }
    if (showVerificationMessage) {
        return renderPostRegistrationView();
    }
    return renderAuthForms();
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-white flex flex-col items-center justify-center p-4">
      
        {!currentUser && !showVerificationMessage && !needsVerification && (
            <div className="text-center mb-8">
                <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">BINGO NIGHT</h1>
                <p className="mt-4 text-lg text-gray-300">Your turn to win!</p>
            </div>
        )}
        
        {renderContent()}
    </div>
  );
}
