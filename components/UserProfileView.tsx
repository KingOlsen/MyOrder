import React, { useState } from 'react';
import { AppUser } from '../types';
import { hashPassword, PHONE_PATTERN, sanitizePhone } from '../services/firebase';

interface UserProfileViewProps {
  currentUser: AppUser;
  onUpdateUser: (updated: AppUser) => Promise<void>;
  onConnectGoogleCloud: () => Promise<void>;
  onLogout: () => void;
}

const UserProfileView: React.FC<UserProfileViewProps> = ({
  currentUser,
  onUpdateUser,
  onConnectGoogleCloud,
  onLogout,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [phone, setPhone] = useState(currentUser.phone);
  const [address, setAddress] = useState(currentUser.address);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (name.trim().length < 1 || name.trim().length > 100) {
      setMessage({ type: 'error', text: 'Name must be between 1 and 100 characters.' });
      return;
    }
    if (phone.trim().length < 3 || phone.trim().length > 30 || !PHONE_PATTERN.test(phone.trim())) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number (3-30 digits).' });
      return;
    }
    if (newPassword && newPassword.trim().length < 4) {
      setMessage({ type: 'error', text: 'New password must be at least 4 characters.' });
      return;
    }

    setSaving(true);
    try {
      const updatedPassHash = newPassword.trim()
        ? await hashPassword(newPassword.trim())
        : currentUser.passwordHash;

      const updatedUser: AppUser = {
        ...currentUser,
        name: name.trim().slice(0, 100),
        phone: sanitizePhone(phone),
        address: (address.trim() || '123 Culinary Ave, Foodie City').slice(0, 200),
        passwordHash: updatedPassHash,
      };

      await onUpdateUser(updatedUser);
      setNewPassword('');
      setMessage({ type: 'success', text: 'Account profile updated!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center text-2xl font-bold">
              {(currentUser.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{currentUser.name}</h2>
              <p className="text-sm text-slate-500">Phone: {currentUser.phone}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!currentUser.isCloudSynced ? (
              <button
                type="button"
                onClick={onConnectGoogleCloud}
                className="bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 px-3.5 py-2 rounded-xl text-xs font-bold transition"
              >
                ☁️ Enable Cloud Backup
              </button>
            ) : (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold">
                ☁️ Cloud Synced
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 px-3.5 py-2 rounded-xl text-xs font-bold transition"
            >
              Switch / Register User
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`p-3.5 rounded-xl text-sm font-medium border ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                User / Restaurant Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                required
                maxLength={30}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Restaurant Address (Printed on Receipts)
            </label>
            <input
              type="text"
              maxLength={200}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Change Password (leave blank to keep current)
            </label>
            <input
              type="password"
              minLength={4}
              placeholder="Enter new password (min 4 characters)"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Account Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfileView;
