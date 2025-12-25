import React from 'react';

const AdminDashboard: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#020617] p-4 md:p-12 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto w-full">
        <header className="mb-12">
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">
            Admin <span className="text-cyan-500">Dashboard</span>
          </h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            Monitor Usage & Urus Kelulusan Pengguna
          </p>
        </header>

        <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-3xl">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
            Admin Dashboard - Coming Soon
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
