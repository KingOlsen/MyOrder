
import React from 'react';
import { Transaction } from '../types';

interface RevenueViewProps {
  transactions: Transaction[];
}

const RevenueView: React.FC<RevenueViewProps> = ({ transactions }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();

  const todayTransactions = transactions.filter(t => {
    const d = new Date(t.timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  const monthTransactions = transactions.filter(t => {
    const d = new Date(t.timestamp);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.total, 0);
  const monthlyRevenue = monthTransactions.reduce((sum, t) => sum + t.total, 0);

  // Best Selling Items
  const itemCounts: Record<string, { name: string, count: number, revenue: number }> = {};
  transactions.forEach(t => {
    t.items.forEach(item => {
      if (!itemCounts[item.id]) {
        itemCounts[item.id] = { name: item.name, count: 0, revenue: 0 };
      }
      itemCounts[item.id].count += item.quantity;
      itemCounts[item.id].revenue += (item.price * item.quantity);
    });
  });

  const bestSellers = Object.values(itemCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Group by day for monthly report
  const dailyBreakdown: Record<string, number> = {};
  monthTransactions.forEach(t => {
    const dateStr = new Date(t.timestamp).toLocaleDateString();
    dailyBreakdown[dateStr] = (dailyBreakdown[dateStr] || 0) + t.total;
  });

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(today);

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Today's Revenue</p>
          <h3 className="text-4xl font-bold text-orange-500 font-serif">${todayRevenue.toFixed(2)}</h3>
          <p className="text-xs text-slate-500 mt-2">{todayTransactions.length} transactions</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Monthly Revenue ({monthName})</p>
          <h3 className="text-4xl font-bold text-slate-800 font-serif">${monthlyRevenue.toFixed(2)}</h3>
          <p className="text-xs text-slate-500 mt-2">{monthTransactions.length} total orders</p>
        </div>

        <div className="bg-indigo-600 p-6 rounded-2xl shadow-md text-white">
          <p className="text-sm font-semibold opacity-80 uppercase tracking-wider mb-2">Avg. Ticket Size</p>
          <h3 className="text-4xl font-bold font-serif">
            ${monthTransactions.length > 0 ? (monthlyRevenue / monthTransactions.length).toFixed(2) : "0.00"}
          </h3>
          <p className="text-xs opacity-70 mt-2">Based on current month data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h4 className="font-bold text-slate-800">Top Selling Items</h4>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {bestSellers.length > 0 ? (
                bestSellers.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.count} units sold</p>
                      </div>
                    </div>
                    <span className="font-semibold text-slate-700">${item.revenue.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <p className="text-center py-10 text-slate-400 text-sm italic">No items sold yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Daily History */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h4 className="font-bold text-slate-800">Daily Sales History</h4>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{monthName} {thisYear}</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(dailyBreakdown).length > 0 ? (
                  Object.entries(dailyBreakdown).map(([date, amount]) => (
                    <tr key={date} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">{date}</td>
                      <td className="px-6 py-4 text-sm text-slate-800 font-bold text-right">${amount.toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-6 py-10 text-center text-slate-400 text-sm italic">No records found for this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueView;
