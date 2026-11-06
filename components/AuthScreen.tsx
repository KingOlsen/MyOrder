import React, { useState } from 'react';
import { AppUser } from '../types';
import {
  hashPassword,
  sanitizeId,
  sanitizePhone,
  PHONE_PATTERN,
  signInWithGooglePopup,
  fetchFirestoreUserAccount,
  saveFirestoreUserAccount,
} from '../services/firebase';
import {
  loginServerUser,
  registerServerUser,
  SyncedWorkspace,
} from '../services/syncService';

interface AuthScreenProps {
  registeredUsers: AppUser[];
  onRegisterUser: (user: AppUser, serverWorkspace?: SyncedWorkspace) => void;
  onLoginSuccess: (user: AppUser, serverWorkspace?: SyncedWorkspace) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({
  registeredUsers,
  onRegisterUser,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'complete-google'>('login');
  const [identifier, setIdentifier] = useState(''); // Phone or Name for login
  const [loginPassword, setLoginPassword] = useState('');

  // Registration fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('123 Culinary Ave, Foodie City');

  // Pending Google user if completing profile
  const [pendingGoogleUid, setPendingGoogleUid] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedId = identifier.trim().toLowerCase();
    const cleanInputPhone = identifier.replace(/[^0-9]/g, '');

    if (!trimmedId || !loginPassword) {
      setError('Please enter your phone number (or name) and password.');
      return;
    }

    setLoading(true);
    try {
      const passHash = await hashPassword(loginPassword);

      // 1. Try authoritative multi-device server login first
      try {
        const syncedWorkspace = await loginServerUser(identifier.trim(), passHash);
        onRegisterUser(syncedWorkspace.user, syncedWorkspace);
        onLoginSuccess(syncedWorkspace.user, syncedWorkspace);
        return;
      } catch (serverErr: any) {
        // Fallback to local registeredUsers if user exists locally before initial server push
        const matchedLocalUser = registeredUsers.find((u) => {
          const uPhoneClean = u.phone.replace(/[^0-9]/g, '');
          const phoneMatch =
            u.phone.trim().toLowerCase() === trimmedId ||
            (cleanInputPhone.length >= 3 && uPhoneClean === cleanInputPhone);
          const nameMatch = u.name.trim().toLowerCase() === trimmedId;
          return phoneMatch || nameMatch;
        });

        if (!matchedLocalUser) {
          throw serverErr;
        }

        if (matchedLocalUser.passwordHash !== passHash) {
          setError('Incorrect password. Please try again.');
          setLoading(false);
          return;
        }

        onLoginSuccess(matchedLocalUser);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (trimmedName.length < 1 || trimmedName.length > 100) {
      setError('Name must be between 1 and 100 characters.');
      return;
    }

    if (trimmedPhone.length < 3 || trimmedPhone.length > 30 || !PHONE_PATTERN.test(trimmedPhone)) {
      setError('Please enter a valid phone number (3-30 digits, +, -, spaces, parentheses).');
      return;
    }

    if (password.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const cleanNewPhone = trimmedPhone.replace(/[^0-9]/g, '');
    const duplicate = registeredUsers.find(
      (u) =>
        u.id !== pendingGoogleUid &&
        (u.phone.replace(/[^0-9]/g, '') === cleanNewPhone ||
          u.name.trim().toLowerCase() === trimmedName.toLowerCase())
    );

    if (duplicate) {
      setError('An account with this phone number or name is already registered. Please sign in.');
      return;
    }

    setLoading(true);
    try {
      const passHash = await hashPassword(password);
      const userId = pendingGoogleUid
        ? sanitizeId(pendingGoogleUid)
        : sanitizeId(`user_${cleanNewPhone}_${Date.now().toString(36)}`);

      const newUser: AppUser = {
        id: userId,
        name: trimmedName.slice(0, 100),
        phone: sanitizePhone(trimmedPhone),
        passwordHash: passHash,
        address: (address.trim() || '123 Culinary Ave, Foodie City').slice(0, 200),
        isCloudSynced: Boolean(pendingGoogleUid),
        createdAt: new Date().toISOString(),
      };

      // Register on multi-device server store
      const serverWorkspace = await registerServerUser(newUser);

      if (pendingGoogleUid) {
        await saveFirestoreUserAccount(serverWorkspace.user);
      }

      onRegisterUser(serverWorkspace.user, serverWorkspace);
      onLoginSuccess(serverWorkspace.user, serverWorkspace);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const credential = await signInWithGooglePopup();
      const fbUser = credential.user;
      const existingCloudUser = await fetchFirestoreUserAccount(fbUser.uid);

      if (existingCloudUser) {
        const syncedWs = await registerServerUser(existingCloudUser, undefined, true);
        onRegisterUser(existingCloudUser, syncedWs);
        onLoginSuccess(existingCloudUser, syncedWs);
      } else {
        setPendingGoogleUid(fbUser.uid);
        setName(fbUser.displayName || '');
        setPhone(fbUser.phoneNumber || '');
        setMode('complete-google');
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google sign-in could not be completed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
        {/* Brand Header */}
        <div className="bg-slate-800 p-6 text-center text-white">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl mx-auto flex items-center justify-center text-2xl font-bold shadow-lg mb-3">
            D
          </div>
          <h1 className="text-2xl font-bold font-serif">Selera King POS</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-Time Multi-Device Restaurant POS
          </p>
        </div>

        {/* Mode Switcher */}
        {mode !== 'complete-google' && (
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-3.5 text-sm font-bold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-orange-600 border-b-2 border-orange-500'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-3.5 text-sm font-bold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-orange-600 border-b-2 border-orange-500'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Register User
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium p-3 rounded-xl">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Phone Number or User Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 012-3456789 or Ali Bistro"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter your password"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {loading ? 'Signing In...' : 'Sign In & Sync Workspace'}
              </button>

              {registeredUsers.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Registered Accounts (Synced Across All Devices)
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {registeredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setIdentifier(u.phone);
                          setError(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50 flex justify-between items-center transition"
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-500">Tel: {u.phone}</div>
                        </div>
                        <span className="text-xs text-orange-600 font-semibold">Select →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              {mode === 'complete-google' && (
                <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs p-3 rounded-xl">
                  Google account connected! Complete your POS user registration below with your Name, Phone, and Password.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  User / Restaurant Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="e.g. DaporKu Bistro (Ahmad)"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={30}
                  placeholder="e.g. 012-3456789"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Min 4 chars"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Repeat password"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Restaurant Address (For Receipts)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="123 Culinary Ave, Foodie City"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {loading ? 'Creating Account...' : 'Register & Sync Across Devices'}
              </button>
            </form>
          )}

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-xs text-slate-400 font-medium">OR GOOGLE ACCOUNT</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition text-sm shadow-sm"
          >
            <span>🌐</span>
            <span>Continue with Google Cloud Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
