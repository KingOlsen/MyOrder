
import React, { useState, useEffect } from 'react';
import { Table, OrderItemStatus } from '../types';

interface KitchenViewProps {
  tables: Table[];
  onUpdateItemStatus: (tableId: number, itemId: string, status: OrderItemStatus) => void;
}

const KitchenView: React.FC<KitchenViewProps> = ({ tables, onUpdateItemStatus }) => {
  const [now, setNow] = useState(Date.now());

  // Force re-render every 10 seconds to update the "time elapsed" indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const tablesWithOrders = tables.filter(t => t.currentOrder && t.currentOrder.length > 0);

  // Sort tables by orderStartTime ascending (Oldest orders appear first)
  const sortedTables = [...tablesWithOrders].sort((a, b) => {
    const timeA = a.orderStartTime ? new Date(a.orderStartTime).getTime() : Infinity;
    const timeB = b.orderStartTime ? new Date(b.orderStartTime).getTime() : Infinity;
    
    if (timeA === timeB) {
      // Secondary sort by table number if times are identical
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    }
    return timeA - timeB;
  });

  if (sortedTables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="text-6xl mb-4">💤</div>
        <h3 className="text-xl font-medium">No active orders right now.</h3>
        <p>The kitchen is quiet... for now.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {sortedTables.map(table => (
        <div key={table.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2">
          <header className="bg-slate-800 text-white p-4 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider opacity-60">Table</span>
              <h3 className="text-2xl font-bold leading-none">{table.number}</h3>
            </div>
            <div className="text-right">
              {table.orderStartTime && (
                <div className="text-[10px] font-mono opacity-80">
                  Ordered: {new Date(table.orderStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </header>
          
          <div className="flex-1 p-4 space-y-2">
            {table.currentOrder?.map(item => {
              const FIFTEEN_MINUTES = 15 * 60 * 1000;
              const startTime = table.orderStartTime ? new Date(table.orderStartTime).getTime() : 0;
              const isOverdue = item.status === 'Pending' && startTime > 0 && (now - startTime > FIFTEEN_MINUTES);
              const elapsedMinutes = startTime > 0 ? Math.floor((now - startTime) / 60000) : 0;

              return (
                <button
                  key={item.id}
                  onClick={() => onUpdateItemStatus(table.id, item.id, item.status === 'Pending' ? 'Ready' : 'Pending')}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start justify-between group ${
                    isOverdue 
                      ? 'animate-blink-alert shadow-md z-10' 
                      : item.status === 'Ready' 
                      ? 'bg-green-50 border-green-200 opacity-60' 
                      : 'bg-white border-slate-100 hover:border-orange-200'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className={`font-bold ${isOverdue ? 'text-white' : 'text-slate-800'}`}>{item.quantity}x</span>
                      <span className={`font-medium truncate ${
                        item.status === 'Ready' ? 'line-through text-slate-500' : 
                        isOverdue ? 'text-white' : 'text-slate-700'
                      }`}>
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className={`text-[10px] uppercase font-bold ${isOverdue ? 'text-red-100' : 'text-slate-400'}`}>
                        {item.category}
                      </span>
                      {item.remark && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded italic ${
                          isOverdue ? 'bg-white/20 text-white' : 'text-orange-600 bg-orange-50'
                        }`}>
                          " {item.remark} "
                        </span>
                      )}
                      {item.status === 'Pending' && startTime > 0 && (
                        <span className={`text-[9px] font-mono font-bold ${isOverdue ? 'text-white' : 'text-slate-400'}`}>
                          ({elapsedMinutes}m ago)
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 mt-1 ${
                    item.status === 'Ready' 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : isOverdue 
                      ? 'bg-white border-white text-red-600'
                      : 'border-slate-200 group-hover:border-orange-400'
                  }`}>
                    {item.status === 'Ready' && '✓'}
                    {isOverdue && item.status !== 'Ready' && '!'}
                  </div>
                </button>
              );
            })}
          </div>

          <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
             <span className="text-xs text-slate-400 font-medium">
                {table.currentOrder?.filter(i => i.status === 'Ready').length} / {table.currentOrder?.length} Items Ready
             </span>
             {table.currentOrder?.every(i => i.status === 'Ready') && (
               <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-md">Fully Prepared</span>
             )}
          </footer>
        </div>
      ))}
    </div>
  );
};

export default KitchenView;
