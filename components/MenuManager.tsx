
import React, { useState } from 'react';
import { MenuItem, Category } from '../types';
import { generateMenuDescription } from '../services/geminiService';

interface MenuManagerProps {
  menu: MenuItem[];
  setMenu: React.Dispatch<React.SetStateAction<MenuItem[]>>;
}

const MenuManager: React.FC<MenuManagerProps> = ({ menu, setMenu }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: '',
    price: 0,
    category: 'Food',
    description: ''
  });

  const handleSaveItem = () => {
    if (newItem.name && newItem.price !== undefined) {
      if (editingItem) {
        setMenu(prev => prev.map(item => 
          item.id === editingItem.id 
            ? { ...item, ...newItem, price: Number(newItem.price) } as MenuItem 
            : item
        ));
      } else {
        const item: MenuItem = {
          id: Date.now().toString(),
          name: newItem.name,
          price: Number(newItem.price),
          category: newItem.category as Category,
          description: newItem.description
        };
        setMenu(prev => [...prev, item]);
      }
      resetForm();
    }
  };

  const resetForm = () => {
    setNewItem({ name: '', price: 0, category: 'Food', description: '' });
    setIsAdding(false);
    setEditingItem(null);
  };

  const handleEditClick = (item: MenuItem) => {
    setEditingItem(item);
    setNewItem({
      name: item.name,
      price: item.price,
      category: item.category,
      description: item.description
    });
    setIsAdding(true);
    setDeleteConfirmId(null);
  };

  const handleGenerateDescription = async () => {
    if (!newItem.name) return;
    setLoadingAI(true);
    const desc = await generateMenuDescription(newItem.name, newItem.category || 'Food');
    setNewItem(prev => ({ ...prev, description: desc }));
    setLoadingAI(false);
  };

  const removeItem = (id: string) => {
    if (deleteConfirmId === id) {
      setMenu(prev => prev.filter(item => item.id !== id));
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
    }
  };

  const sortedMenu = [...menu].sort((a, b) => {
    const catCompare = a.category.localeCompare(b.category);
    if (catCompare !== 0) return catCompare;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-700">Current Menu</h2>
        {!isAdding && (
          <button 
            onClick={() => {
              setIsAdding(true);
              setDeleteConfirmId(null);
            }}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition shadow-sm flex items-center space-x-2"
          >
            <span>+</span>
            <span>Add New Item</span>
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-sky-50 p-6 rounded-xl border border-sky-200 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="font-bold text-sky-900">
            {editingItem ? `Update ${editingItem.name}` : 'Add New Dish or Drink'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              type="text" 
              placeholder="Item Name" 
              className="border border-sky-200 rounded-lg p-2 focus:ring-2 focus:ring-sky-400 outline-none bg-white text-slate-800"
              value={newItem.name}
              onChange={(e) => setNewItem({...newItem, name: e.target.value})}
            />
            <input 
              type="number" 
              placeholder="Price ($)" 
              className="border border-sky-200 rounded-lg p-2 focus:ring-2 focus:ring-sky-400 outline-none bg-white text-slate-800"
              value={newItem.price || ''}
              onChange={(e) => setNewItem({...newItem, price: Number(e.target.value)})}
            />
            <select 
              className="border border-sky-200 rounded-lg p-2 focus:ring-2 focus:ring-sky-400 outline-none bg-white text-slate-800"
              value={newItem.category}
              onChange={(e) => setNewItem({...newItem, category: e.target.value as Category})}
            >
              <option value="Food">Food</option>
              <option value="Drink">Drink</option>
              <option value="Dessert">Dessert</option>
            </select>
          </div>
          <div className="relative">
            <textarea 
              placeholder="Description (optional)" 
              className="w-full border border-sky-200 rounded-lg p-2 h-20 focus:ring-2 focus:ring-sky-400 outline-none pr-32 bg-white text-slate-800"
              value={newItem.description}
              onChange={(e) => setNewItem({...newItem, description: e.target.value})}
            />
            <button 
              onClick={handleGenerateDescription}
              disabled={loadingAI || !newItem.name}
              className="absolute right-2 bottom-2 text-xs bg-sky-100 text-sky-700 px-3 py-1 rounded-md border border-sky-200 hover:bg-sky-200 disabled:opacity-50"
            >
              {loadingAI ? 'Generating...' : '✨ AI Description'}
            </button>
          </div>
          <div className="flex justify-end space-x-3">
            <button onClick={resetForm} className="text-sky-600 hover:text-sky-800 px-4 py-2 font-medium">Cancel</button>
            <button 
              onClick={handleSaveItem} 
              className="bg-sky-600 text-white px-6 py-2 rounded-lg hover:bg-sky-700 transition-colors shadow-sm font-semibold"
            >
              {editingItem ? 'Update Item' : 'Save Item'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Name</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Category</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Price</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedMenu.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">{item.description}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    item.category === 'Food' ? 'bg-amber-100 text-amber-700' : 
                    item.category === 'Drink' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-slate-700">${item.price.toFixed(2)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end items-center space-x-2">
                    <button 
                      onClick={() => handleEditClick(item)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => removeItem(item.id)}
                      onMouseLeave={() => deleteConfirmId === item.id && setDeleteConfirmId(null)}
                      className={`px-2 py-1.5 rounded-lg transition-all flex items-center space-x-1 ${
                        deleteConfirmId === item.id 
                          ? 'bg-red-500 text-white font-bold text-xs' 
                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                      }`}
                      title="Delete"
                    >
                      {deleteConfirmId === item.id ? (
                        <span>Confirm?</span>
                      ) : (
                        <span>🗑️</span>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedMenu.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                  No items in the menu. Click "Add New Item" to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MenuManager;
