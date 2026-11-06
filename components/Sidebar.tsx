import React from 'react';
import { AppUser } from '../types';

export type AppView = 'tables' | 'menu' | 'kitchen' | 'revenue' | 'expenses' | 'history' | 'profile';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  currentUser: AppUser;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, currentUser, onLogout }) => {
  const NavItem = ({ id, label, icon }: { id: AppView; label: string; icon: string }) => (
    <button
      onClick={() => setView(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        currentView === id
          ? 'bg-orange-500 text-white shadow-md'
          : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="hidden md:block font-medium">{label}</span>
    </button>
  );

  const initial = (currentUser.name || 'D').trim().charAt(0).toUpperCase();

  return (
    <aside className="w-20 md:w-64 bg-white border-r border-slate-200 flex flex-col p-4 no-print">
      <div className="mb-8 flex items-center space-x-2 px-2">
        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0">
          {initial}
        </div>
        <div className="hidden md:block min-w-0">
          <div className="text-lg font-bold text-slate-800 tracking-tight truncate">
            {currentUser.name}
          </div>
          <div className="text-xs text-slate-400 truncate">Tel: {currentUser.phone}</div>
        </div>
      </div>

      <nav className="space-y-2 flex-1">
        <NavItem id="tables" label="Tables" icon="🪑" />
        <NavItem id="kitchen" label="Kitchen" icon="👨‍🍳" />
        <NavItem id="menu" label="Menu" icon="📖" />
        <NavItem id="history" label="Order History" icon="📜" />
        <NavItem id="revenue" label="Revenue" icon="📊" />
        <NavItem id="expenses" label="Expenses" icon="💸" />
        <NavItem id="profile" label="User Account" icon="👤" />
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-100 space-y-3">
        <div className="hidden md:block px-2">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active User</p>
          <p className="text-sm font-bold text-slate-700 truncate mt-0.5">{currentUser.name}</p>
          <p className="text-xs text-slate-500 truncate">{currentUser.phone}</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center md:justify-start space-x-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          title="Switch User / Log Out"
        >
          <span>🚪</span>
          <span className="hidden md:inline">Switch / Log Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
