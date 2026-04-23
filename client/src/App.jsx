import { Routes, Route, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Transactions from './pages/Transactions.jsx';
import Budgets from './pages/Budgets.jsx';
import Bills from './pages/Bills.jsx';
import Login from './pages/Login.jsx';

function AppLayout() {
  return (
    <div className="flex h-full min-h-screen bg-surface-900 text-slate-100">
      <Sidebar />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/bills" element={<Bills />} />
      </Route>
    </Routes>
  );
}
