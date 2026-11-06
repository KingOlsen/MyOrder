
import React, { useState } from 'react';
import { Transaction } from '../types';

interface OrderHistoryViewProps {
  transactions: Transaction[];
}

const OrderHistoryView: React.FC<OrderHistoryViewProps> = ({ transactions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const filteredTransactions = transactions.filter(tx => 
    tx.tableNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
          <input
            type="text"
            placeholder="Search by Table Number or Receipt ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="text-slate-500 text-sm font-medium">
          Total Records: <span className="text-slate-800 font-bold">{filteredTransactions.length}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Time</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Receipt ID</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Table</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Items</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTransactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-800">
                    {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(tx.timestamp).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-slate-500">#{tx.id.slice(-6)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    tx.tableNumber.startsWith('COD') 
                      ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                      : 'bg-orange-50 text-orange-600 border border-orange-100'
                  }`}>
                    Table {tx.tableNumber}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 text-right">
                  {tx.items.reduce((sum, item) => sum + item.quantity, 0)}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-slate-800 text-right">
                  ${tx.total.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => setSelectedTx(tx)}
                    className="text-orange-500 hover:text-orange-700 font-bold text-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic">
                  No orders found. Once a table is paid, history will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <header className="p-6 bg-slate-800 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Table {selectedTx.tableNumber}</h3>
                <p className="text-xs opacity-70">Order ID: {selectedTx.id}</p>
              </div>
              <button 
                onClick={() => setSelectedTx(null)}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl"
              >
                ×
              </button>
            </header>
            
            <div className="p-6">
              <div className="flex justify-between items-center mb-6 text-sm">
                <span className="text-slate-400 font-medium">Recorded at</span>
                <span className="text-slate-800 font-bold">{new Date(selectedTx.timestamp).toLocaleString()}</span>
              </div>

              <div className="space-y-3 mb-8">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Order Items</p>
                {selectedTx.items.map((item, idx) => (
                  <div key={idx} className="py-2 border-b border-slate-50 last:border-0">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <span className="font-bold text-slate-800">{item.quantity}x</span>
                        <span className="ml-2 text-slate-600">{item.name}</span>
                      </div>
                      <span className="text-slate-800 font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                    {item.remark && (
                      <p className="text-xs text-orange-600 italic mt-1 ml-6">
                        Remark: {item.remark}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">${selectedTx.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span className="font-medium">$0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-slate-800 border-t border-slate-200 pt-2 mt-2">
                  <span>Total Paid</span>
                  <span>${selectedTx.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
               <button 
                 onClick={() => setSelectedTx(null)}
                 className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition"
               >
                 Close Summary
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistoryView;
