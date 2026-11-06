
import React, { useState, useEffect } from 'react';
import { Table, RestaurantData } from '../types';
import { generateWittyGreeting } from '../services/geminiService';

interface ReceiptModalProps {
  table: Table;
  restaurantInfo: RestaurantData;
  onClose: () => void;
  onPaid: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ table, restaurantInfo, onClose, onPaid }) => {
  const [wittyNote, setWittyNote] = useState('Thank you for dining with us!');
  const subtotal = table.currentOrder?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0;
  // Tax set to $0.00 as requested
  const tax = 0;
  const total = subtotal;

  useEffect(() => {
    generateWittyGreeting(restaurantInfo.name).then(setWittyNote);
  }, [restaurantInfo.name]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[60] p-4 backdrop-blur-md no-print">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Payment Summary</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
          {/* Printable Receipt Design */}
          <div className="w-full max-w-sm bg-slate-50 p-6 rounded-lg border border-dashed border-slate-300 font-mono text-sm text-slate-700">
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold uppercase">{restaurantInfo.name}</h2>
              <p className="text-xs">{restaurantInfo.address}</p>
              <p className="text-xs">Tel: {restaurantInfo.phone}</p>
              <div className="border-b border-slate-300 my-4"></div>
              <div className="flex justify-between text-xs">
                <span>Table: {table.number}</span>
                <span>Date: {new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Server: Staff #01</span>
                <span>Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {table.currentOrder?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>{item.quantity}x {item.name}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-300 pt-4 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-slate-300 pt-2 mt-2">
                <span>TOTAL</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center mt-8 italic text-xs">
              <p>"{wittyNote}"</p>
              <p className="mt-2 font-bold">Please Come Again!</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-4">
          <button 
            onClick={handlePrint}
            className="bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-100 flex items-center justify-center space-x-2"
          >
            <span>🖨️</span>
            <span>Print Bill</span>
          </button>
          <button 
            onClick={onPaid}
            className="bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow-md shadow-green-200"
          >
            Mark Paid
          </button>
        </div>
      </div>

      {/* Actual print output - Hidden on screen, visible during print */}
      <div className="print-only fixed inset-0 bg-white p-10 font-mono text-black">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold uppercase">{restaurantInfo.name}</h2>
          <p>{restaurantInfo.address}</p>
          <p>Tel: {restaurantInfo.phone}</p>
          <div className="border-b-2 border-black my-4"></div>
          <div className="flex justify-between">
            <span>Table: {table.number}</span>
            <span>{new Date().toLocaleString()}</span>
          </div>
        </div>
        <div className="space-y-2 mb-6 min-h-[200px]">
          {table.currentOrder?.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>{item.quantity}x {item.name}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t-2 border-black pt-4 space-y-2">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>$0.00</span>
          </div>
          <div className="flex justify-between text-xl font-bold">
            <span>TOTAL</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
        <div className="text-center mt-12">
          <p>{wittyNote}</p>
          <p className="mt-4 font-bold">Thank You!</p>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
