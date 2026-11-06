import React, { useState, useEffect } from 'react';
import { Table } from '../types';

interface TableGridProps {
  tables: Table[];
  onSelectTable: (id: number) => void;
}

const TableGrid: React.FC<TableGridProps> = ({ tables, onSelectTable }) => {
  // Use local state to force a re-render every 10 seconds so the time calculation updates
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const dineInTables = tables.filter((t) => !t.number.toUpperCase().startsWith('TAPAU'));
  const tapauTables = tables.filter((t) => t.number.toUpperCase().startsWith('TAPAU'));

  const renderTableCard = (table: Table) => {
    const isTapau = table.number.toUpperCase().startsWith('TAPAU');
    const hasItems = table.currentOrder && table.currentOrder.length > 0;
    const isFullyPrepared =
      hasItems && table.currentOrder!.every((item) => item.status === 'Ready');

    // Calculate if order is overdue (15 minutes = 900,000 ms)
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const isOverdue =
      table.status === 'Occupied' &&
      !isFullyPrepared &&
      table.orderStartTime &&
      now - new Date(table.orderStartTime).getTime() > FIFTEEN_MINUTES;

    return (
      <button
        key={table.id}
        onClick={() => onSelectTable(table.id)}
        className={`aspect-square rounded-2xl border-2 p-3 flex flex-col items-center justify-center transition-all transform hover:scale-105 ${
          isOverdue
            ? 'animate-blink-alert'
            : table.status === 'Available'
            ? isTapau
              ? 'bg-amber-50/40 border-amber-200 text-slate-700 hover:border-orange-300 hover:shadow-lg'
              : 'bg-white border-slate-200 text-slate-600 hover:border-orange-200 hover:shadow-lg'
            : isFullyPrepared
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
            : table.status === 'Occupied'
            ? 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}
      >
        <span className="text-xs font-semibold uppercase tracking-widest mb-1 opacity-75">
          {isTapau ? '🛍️ Takeaway' : 'Table'}
        </span>
        <span
          className={`${
            isTapau ? 'text-2xl sm:text-3xl' : 'text-4xl'
          } font-bold mb-2 text-center leading-tight`}
        >
          {table.number}
        </span>
        <div className="flex items-center space-x-1">
          <div
            className={`w-2 h-2 rounded-full ${
              isOverdue
                ? 'bg-white'
                : table.status === 'Available'
                ? 'bg-slate-300'
                : isFullyPrepared
                ? 'bg-emerald-500'
                : table.status === 'Occupied'
                ? 'bg-orange-500'
                : 'bg-green-500'
            }`}
          ></div>
          <span className={`text-xs font-medium ${isOverdue ? 'font-bold' : ''}`}>
            {isOverdue ? 'LATE ORDER' : isFullyPrepared ? 'Ready to Serve' : table.status}
          </span>
        </div>
        {hasItems && (
          <div
            className={`mt-2 text-[10px] px-2 py-0.5 rounded-full border shadow-sm ${
              isOverdue
                ? 'bg-white border-red-200 text-red-600 font-bold'
                : isFullyPrepared
                ? 'bg-white border-emerald-100 text-emerald-600'
                : 'bg-white border-orange-100 text-orange-600'
            }`}
          >
            {table.currentOrder!.length} items
          </div>
        )}
        {isOverdue && table.orderStartTime && (
          <div className="mt-1 text-[10px] font-bold text-red-800">
            Wait: {Math.floor((now - new Date(table.orderStartTime).getTime()) / 60000)}m
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
          Dine-In Tables
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {dineInTables.map(renderTableCard)}
        </div>
      </div>

      {tapauTables.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-600 mb-4">
            Takeaway / Tapau Orders
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {tapauTables.map(renderTableCard)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableGrid;
