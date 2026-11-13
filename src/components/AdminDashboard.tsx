import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  BarChart3,
  CreditCard,
  Database,
  Download,
  Edit3,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type {
  AdminRole,
  AdminUser,
  BackupSnapshot,
  CustomerRecord,
  DashboardStats,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
} from '../types/shop.ts';
import {
  CATEGORY_LABELS,
  formatDateTimeKm,
  formatDualMoney,
  ORDER_STATUS_LABELS,
} from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';
import { AdminProductFormModal } from './AdminProductFormModal.tsx';

interface AdminSessionUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  email?: string;
}

interface AdminDashboardProps {
  onNavigateStore: () => void;
}

type AdminTab = 'overview' | 'products' | 'orders' | 'customers' | 'security';

export function AdminDashboard({ onNavigateStore }: AdminDashboardProps) {
  const [authLoading, setAuthLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);

  const [dataLoading, setDataLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');

  // New Admin User Form (Super Admin only)
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('manager');

  const authHeaders = useCallback((): Record<string, string> => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }, [authToken]);

  const loadAllAdminData = useCallback(async () => {
    setDataLoading(true);
    setActionError('');
    try {
      const headers = authHeaders();
      const [statsRes, prodRes, ordRes, custRes, payRes, bkpRes] = await Promise.all([
        fetch('/api/admin/stats', { headers, credentials: 'include' }),
        fetch('/api/products', { headers, credentials: 'include' }),
        fetch('/api/admin/orders', { headers, credentials: 'include' }),
        fetch('/api/admin/customers', { headers, credentials: 'include' }),
        fetch('/api/admin/payments', { headers, credentials: 'include' }),
        fetch('/api/admin/backups', { headers, credentials: 'include' }),
      ]);

      if (statsRes.ok) {
        const d = (await statsRes.json()) as { stats: DashboardStats };
        setStats(d.stats);
      }
      if (prodRes.ok) {
        const d = (await prodRes.json()) as { products: Product[] };
        setProducts(d.products);
      }
      if (ordRes.ok) {
        const d = (await ordRes.json()) as { orders: Order[] };
        setOrders(d.orders);
      }
      if (custRes.ok) {
        const d = (await custRes.json()) as { customers: CustomerRecord[] };
        setCustomers(d.customers);
      }
      if (payRes.ok) {
        const d = (await payRes.json()) as { payments: PaymentRecord[] };
        setPayments(d.payments);
      }
      if (bkpRes.ok) {
        const d = (await bkpRes.json()) as { backups: BackupSnapshot[] };
        setBackups(d.backups);
      }

      if (adminUser?.role === 'super_admin') {
        const usersRes = await fetch('/api/admin/users', { headers, credentials: 'include' });
        if (usersRes.ok) {
          const d = (await usersRes.json()) as { users: AdminUser[] };
          setAdminUsers(d.users);
        }
      }
    } catch {
      setActionError('មិនអាចទាញយកទិន្នន័យគ្រប់គ្រងបានទេ');
    } finally {
      setDataLoading(false);
    }
  }, [authHeaders, adminUser?.role]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/me', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as { user: AdminSessionUser };
          setAdminUser(data.user);
        }
      } catch {
        // Not logged in
      } finally {
        setAuthLoading(false);
      }
    };
    void checkSession();
  }, []);

  useEffect(() => {
    if (adminUser) {
      void loadAllAdminData();
    }
  }, [adminUser, loadAllAdminData]);

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          password,
          accessCode: accessCode.trim(),
        }),
      });
      const data = (await res.json()) as {
        user?: AdminSessionUser;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setLoginError(data.error || 'ការចូលគណនីបរាជ័យ');
        return;
      }
      setAuthToken(data.token || null);
      setAdminUser(data.user);
    } catch {
      setLoginError('មិនអាចភ្ជាប់ទៅ Server បានទេ');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    if (!accessCode.trim()) {
      setLoginError('សូមបញ្ចូល Admin Access Code ជាមុនសិន មុនពេលចុច Sign in with Google');
      return;
    }
    setLoginError('');
    setLoginBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/admin/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken, accessCode: accessCode.trim() }),
      });
      const data = (await res.json()) as {
        user?: AdminSessionUser;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setLoginError(data.error || 'គណនី Google នេះមិនមានសិទ្ធិ Admin ទេ');
        return;
      }
      setAuthToken(data.token || null);
      setAdminUser(data.user);
    } catch {
      setLoginError('ការចូលដោយប្រើ Google បរាជ័យ');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    setAdminUser(null);
    setAuthToken(null);
    setPassword('');
    setAccessCode('');
  };

  const handleDeleteProduct = async (id: string) => {
    setActionError('');
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
      credentials: 'include',
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចលុបផលិតផលបានទេ');
    } else {
      setDeleteConfirmId(null);
      setActionMsg('បានលុបផលិតផលដោយជោគជ័យ');
      void loadAllAdminData();
    }
  };

  const handleToggleStockStatus = async (p: Product) => {
    const nextStatus = p.status === 'available' ? 'out_of_stock' : 'available';
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      void loadAllAdminData();
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, orderStatus: OrderStatus) => {
    setActionError('');
    setActionMsg('');
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ orderStatus }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចកែប្រែស្ថានភាពបានទេ');
    } else {
      setActionMsg('បានធ្វើបច្ចុប្បន្នភាពស្ថានភាពការបញ្ជាទិញ');
      void loadAllAdminData();
    }
  };

  const handleCreateAdminUser = async (e: FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionMsg('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        username: newUsername.trim(),
        displayName: newDisplayName.trim() || newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចបង្កើតគណនីបានទេ');
    } else {
      setNewUsername('');
      setNewDisplayName('');
      setNewEmail('');
      setNewPassword('');
      setActionMsg('បានបង្កើតគណនី Admin ថ្មីរួចរាល់');
      void loadAllAdminData();
    }
  };

  const handleToggleAdminActive = async (user: AdminUser) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ active: !user.active }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចកែប្រែស្ថានភាពបានទេ');
    } else {
      void loadAllAdminData();
    }
  };

  const handleRunManualBackup = async () => {
    setActionError('');
    setActionMsg('');
    const res = await fetch('/api/admin/backups', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (res.ok) {
      setActionMsg('បានរក្សាទុក Snapshot Backup ថ្មីក្នុង Cloud Database រួចរាល់');
      void loadAllAdminData();
    } else {
      setActionError('បរាជ័យក្នុងការបង្កើត Backup');
    }
  };

  const handleDownloadBackupJson = async () => {
    const res = await fetch('/api/admin/backups/export', {
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      setActionError('មិនអាចទាញយកឯកសារ Backup បានទេ');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oudom-shop-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestTelegram = async () => {
    setActionError('');
    setActionMsg('');
    const res = await fetch('/api/admin/telegram/test', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'Telegram Bot មិនទាន់បានកំណត់ក្នុង Environment Variables ទេ');
    } else {
      setActionMsg('បានផ្ញើសារសាកល្បងទៅ Telegram Admin ជោគជ័យ!');
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6]">
        <Loader2 className="h-7 w-7 animate-spin text-[#111111]" />
      </div>
    );
  }

  // ---------------- LOGIN SCREEN ----------------
  if (!adminUser) {
    return (
      <div className="min-h-screen flex flex-col justify-center bg-[#0B0B0C] px-4 py-10 text-white">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#141416] p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#C9A227]">ឧត្តម Shop · Admin Portal</p>
              <h1 className="mt-1 text-2xl font-bold text-white">ចូលគ្រប់គ្រងហាង</h1>
            </div>
            <button
              type="button"
              onClick={onNavigateStore}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-white/80 hover:bg-white/10"
            >
              <Store className="h-3.5 w-3.5" />
              <span>ទំព័រហាង</span>
            </button>
          </div>

          <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/75 mb-1.5">
                ឈ្មោះអ្នកប្រើប្រាស់ (Username)
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="oudom_admin"
                className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white placeholder:text-white/35 focus:border-[#C9A227] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/75 mb-1.5">
                ពាក្យសម្ងាត់ (Password)
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white placeholder:text-white/35 focus:border-[#C9A227] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/75 mb-1.5">
                លេខកូដសម្ងាត់ Admin (Admin Access Code)
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9A227]" />
                <input
                  type="password"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="បញ្ចូល Access Code ពី Server"
                  className="h-12 w-full rounded-xl border border-white/15 bg-black/40 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-[#C9A227] focus:outline-none"
                />
              </div>
            </div>

            {loginError && (
              <p className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginBusy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] text-sm font-bold text-[#0B0B0C] transition hover:bg-[#D4B038] disabled:opacity-50"
            >
              {loginBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>ចូលប្រព័ន្ធ Admin</span>
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-white/10">
            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={loginBusy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <Shield className="h-4 w-4 text-[#C9A227]" />
              <span>ចូលដោយប្រើគណនី Google (Super Admin)</span>
            </button>
            <p className="mt-3 text-[11px] text-center text-white/45">
              តម្រូវឱ្យបញ្ចូល Admin Access Code និងផ្ទៀងផ្ទាត់សិទ្ធិនៅលើ Server ជានិច្ច
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- AUTHENTICATED ADMIN WORKSPACE ----------------
  const canManageProducts = adminUser.role === 'super_admin' || adminUser.role === 'manager';
  const isSuperAdmin = adminUser.role === 'super_admin';

  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter !== 'all' && o.orderStatus !== orderStatusFilter) return false;
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const navItems: Array<{ key: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { key: 'overview', label: 'ស្ថិតិហាង (Dashboard)', icon: LayoutDashboard },
    { key: 'products', label: 'គ្រប់គ្រងផលិតផល', icon: Package },
    { key: 'orders', label: 'ការបញ្ជាទិញ', icon: ShoppingCart },
    { key: 'customers', label: 'អតិថិជន & ទូទាត់', icon: Users },
    { key: 'security', label: 'សិទ្ធិ & Backup', icon: Database },
  ];

  return (
    <div className="min-h-screen flex bg-[#FAF9F6] text-[#111111]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-[#E5E0D5] bg-[#0B0B0C] text-white">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <span className="text-lg font-bold tracking-tight">ឧត្តម Admin</span>
          <span className="font-mono-num text-[11px] text-[#C9A227]">{adminUser.role}</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition ${
                  active
                    ? 'bg-[#C9A227] text-[#0B0B0C] font-semibold'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-2">
          <div className="px-1">
            <p className="text-xs font-semibold text-white truncate">{adminUser.displayName}</p>
            <p className="text-[11px] text-white/50 truncate">@{adminUser.username}</p>
          </div>
          <button
            type="button"
            onClick={onNavigateStore}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-medium text-white/85 hover:bg-white/10"
          >
            <Store className="h-4 w-4 text-[#C9A227]" />
            <span>មើលវេបសាយសាធារណៈ</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-xs font-medium text-red-300 hover:bg-red-950/50"
          >
            <LogOut className="h-4 w-4" />
            <span>ចាកចេញ (Logout)</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="flex h-full w-72 max-w-[85vw] flex-col bg-[#0B0B0C] text-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-base font-bold">ឧត្តម Admin</p>
                <p className="text-xs text-[#C9A227]">{adminUser.role}</p>
              </div>
              <button
                type="button"
                aria-label="បិទ"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-4 flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.key);
                      setMobileNavOpen(false);
                    }}
                    className={`flex h-12 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium ${
                      active ? 'bg-[#C9A227] text-[#0B0B0C] font-semibold' : 'text-white/80'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <button
                type="button"
                onClick={onNavigateStore}
                className="flex h-11 w-full items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-medium text-white"
              >
                <Store className="h-4 w-4 text-[#C9A227]" />
                <span>ទំព័រហាងសាធារណៈ</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-xs font-medium text-red-300"
              >
                <LogOut className="h-4 w-4" />
                <span>ចាកចេញ (Logout)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E5E0D5] bg-white/90 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="បើកម៉ឺនុយ Admin"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-[#111111] truncate">
              {navItems.find((n) => n.key === activeTab)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadAllAdminData()}
              disabled={dataLoading}
              aria-label="ធ្វើបច្ចុប្បន្នភាព"
              className="flex h-10 items-center gap-1.5 rounded-lg border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-medium text-[#111111] hover:border-[#111111]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">ទាញទិន្នន័យថ្មី</span>
            </button>
            {canManageProducts && (
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#111111] px-3.5 text-xs font-semibold text-white hover:bg-[#262626] whitespace-nowrap"
              >
                <Plus className="h-4 w-4 text-[#C9A227]" />
                <span>បន្ថែមទំនិញ</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 space-y-5 max-w-7xl w-full mx-auto">
          {actionMsg && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
              <span>{actionMsg}</span>
              <button type="button" onClick={() => setActionMsg('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {actionError && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900">
              <span>{actionError}</span>
              <button type="button" onClick={() => setActionError('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW STATISTICS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ចំណូលប្រចាំថ្ងៃ (Paid)</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    ${(stats?.dailyRevenueUsd || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ចំណូលប្រចាំខែ (Paid)</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    ${(stats?.monthlyRevenueUsd || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ចំណូលសរុប (Paid)</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#9A6F04]">
                    ${(stats?.totalRevenueUsd || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ការបញ្ជាទិញសរុប</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    {stats?.totalOrders || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ផលិតផលសរុប</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    {stats?.totalProducts || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">អតិថិជនសរុប</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    {stats?.totalCustomers || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">ផលិតផលអស់ពីស្តុក</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-red-700">
                    {stats?.outOfStockCount || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4">
                  <p className="text-xs text-[#6B6559]">អត្រាប្តូរប្រាក់</p>
                  <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono-num text-[#111111]">
                    {(stats?.khrRate || 4100).toLocaleString('en-US')} ៛
                  </p>
                </div>
              </div>

              {/* Sales Chart & Top Selling Products */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 lg:col-span-7">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#B8860B]" />
                      <h2 className="text-sm font-semibold text-[#111111]">
                        ស្ថិតិចំណូល ៧ ថ្ងៃចុងក្រោយ (USD - Paid Only)
                      </h2>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats?.salesChart || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B6559' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6B6559' }} />
                        <Tooltip />
                        <Bar dataKey="revenueUsd" name="ចំណូល ($)" fill="#111111" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 lg:col-span-5">
                  <h2 className="text-sm font-semibold text-[#111111] mb-4">
                    ផលិតផលលក់ដាច់ជាងគេ (ពីការបញ្ជាទិញ Paid)
                  </h2>
                  {!stats?.topProducts?.length ? (
                    <p className="text-xs text-[#6B6559] py-8 text-center">
                      មិនទាន់មានទិន្នន័យការទូទាត់ជោគជ័យនៅឡើយទេ
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topProducts.map((tp) => (
                        <div
                          key={tp.id}
                          className="flex items-center justify-between gap-3 border-b border-[#F2EFE9] pb-2.5 last:border-none last:pb-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#FAF9F6]">
                              <SafeImage
                                src={tp.imageUrl}
                                alt={tp.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#111111] truncate">
                                {tp.name}
                              </p>
                              <p className="text-[11px] font-mono-num text-[#6B6559]">
                                លក់បាន {tp.soldCount} · {tp.sku}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold font-mono-num text-[#111111] shrink-0">
                            ${tp.revenueUsd.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCT MANAGEMENT */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              {/* Mobile Card View */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-[#E5E0D5] bg-white p-4 space-y-3"
                  >
                    <div className="flex gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#FAF9F6]">
                        <SafeImage
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono-num text-[#6B6559]">
                          {p.sku} · {CATEGORY_LABELS[p.category]}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-[#111111] line-clamp-2">
                          {p.name}
                        </p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="text-sm font-bold font-mono-num">
                            ${(p.discountPriceUsd ?? p.priceUsd).toFixed(2)}
                          </span>
                          {p.discountPriceUsd !== null && (
                            <span className="text-xs font-mono-num text-[#8A8478] line-through">
                              ${p.priceUsd.toFixed(2)}
                            </span>
                          )}
                          <span className="text-xs text-[#6B6559] font-mono-num">
                            ស្តុក: {p.stock}
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManageProducts && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#F2EFE9]">
                        <button
                          type="button"
                          onClick={() => handleToggleStockStatus(p)}
                          className={`h-10 rounded-lg border px-3 text-xs font-medium ${
                            p.status === 'available'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}
                        >
                          {p.status === 'available' ? 'Available' : 'Out of Stock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(p);
                            setProductModalOpen(true);
                          }}
                          className="flex h-10 items-center gap-1 rounded-lg border border-[#E2DDD3] px-3 text-xs font-medium"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>កែប្រែ</span>
                        </button>
                        {deleteConfirmId === p.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            className="h-10 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white"
                          >
                            បញ្ជាក់ការលុប
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(p.id)}
                            className="flex h-10 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>លុប</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop High-Density Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#E5E0D5] bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#E5E0D5] bg-[#FAF9F6] text-xs text-[#6B6559]">
                    <tr>
                      <th className="px-4 py-3 font-medium">ផលិតផល</th>
                      <th className="px-4 py-3 font-medium">SKU</th>
                      <th className="px-4 py-3 font-medium">ប្រភេទ</th>
                      <th className="px-4 py-3 font-medium text-right">តម្លៃ (USD)</th>
                      <th className="px-4 py-3 font-medium text-right">ស្តុក</th>
                      <th className="px-4 py-3 font-medium">ស្ថានភាព</th>
                      {canManageProducts && <th className="px-4 py-3 font-medium text-right">សកម្មភាព</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EFE9]">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-[#FAF9F6]/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#FAF9F6]">
                              <SafeImage
                                src={p.imageUrl}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <span className="font-medium text-[#111111] line-clamp-1">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono-num text-xs text-[#6B6559]">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3 text-xs">{CATEGORY_LABELS[p.category]}</td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          <span className="font-semibold">
                            ${(p.discountPriceUsd ?? p.priceUsd).toFixed(2)}
                          </span>
                          {p.discountPriceUsd !== null && (
                            <span className="ml-1.5 text-xs text-[#8A8478] line-through">
                              ${p.priceUsd.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold">
                          {p.stock}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!canManageProducts}
                            onClick={() => handleToggleStockStatus(p)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                              p.status === 'available'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                            }`}
                          >
                            {p.status === 'available' ? 'Available' : 'Out of Stock'}
                          </button>
                        </td>
                        {canManageProducts && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProduct(p);
                                  setProductModalOpen(true);
                                }}
                                className="h-9 rounded-lg border border-[#E2DDD3] px-2.5 text-xs font-medium hover:border-[#111111]"
                              >
                                កែប្រែ
                              </button>
                              {deleteConfirmId === p.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="h-9 rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white"
                                >
                                  បញ្ជាក់លុប
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(p.id)}
                                  className="h-9 rounded-lg border border-red-200 px-2.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  លុប
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ORDER MANAGEMENT */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="ស្វែងរក Order ID, ឈ្មោះ ឬលេខទូរស័ព្ទ..."
                  className="h-11 flex-1 rounded-xl border border-[#E2DDD3] bg-white px-4 text-sm focus:border-[#111111] focus:outline-none"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="h-11 rounded-xl border border-[#E2DDD3] bg-white px-3.5 text-sm"
                >
                  <option value="all">ស្ថានភាពទាំងអស់</option>
                  {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.km}
                    </option>
                  ))}
                </select>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-10 text-center text-sm text-[#6B6559]">
                  មិនទាន់មានការបញ្ជាទិញត្រូវនឹងលក្ខខណ្ឌនេះទេ
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-[#E5E0D5] bg-white p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num text-sm font-bold text-[#111111]">
                              {order.orderNumber}
                            </span>
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                                ORDER_STATUS_LABELS[order.orderStatus].tone
                              }`}
                            >
                              {ORDER_STATUS_LABELS[order.orderStatus].km}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#6B6559]">
                            {formatDateTimeKm(order.createdAt)} · ABA TranID:{' '}
                            <span className="font-mono-num">{order.abaTranId}</span>
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-bold font-mono-num text-[#111111]">
                            {formatDualMoney(order.totalUsd, stats?.khrRate || 4100)}
                          </p>
                          <p className="text-[11px] font-medium text-[#6B6559]">
                            Payment: {order.paymentStatus.toUpperCase()} ({order.paymentMethod})
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl bg-[#FAF9F6] p-3 text-xs">
                        <div>
                          <p className="font-semibold text-[#111111]">អតិថិជន</p>
                          <p className="mt-0.5 text-[#4A463E]">
                            {order.customerName} · {order.customerPhone}
                          </p>
                          <p className="mt-0.5 text-[#6B6559]">{order.shippingAddress}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-[#111111]">មុខទំនិញ</p>
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[#4A463E]">
                              <span className="truncate pr-2">
                                {item.name} × {item.quantity}
                              </span>
                              <span className="font-mono-num shrink-0">
                                ${item.lineTotalUsd.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-[#6B6559]">
                          ផ្លាស់ប្តូរស្ថានភាពដឹកជញ្ជូន / ការបញ្ជាទិញ៖
                        </span>
                        <select
                          value={order.orderStatus}
                          onChange={(e) =>
                            void handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                          }
                          className="h-10 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-semibold text-[#111111]"
                        >
                          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.km} ({v.en})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CUSTOMERS & PAYMENT HISTORY */}
          {activeTab === 'customers' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5">
                <h2 className="text-sm font-semibold text-[#111111] mb-4">
                  បញ្ជីអតិថិជន ({customers.length})
                </h2>
                {customers.length === 0 ? (
                  <p className="text-xs text-[#6B6559] py-6 text-center">មិនទាន់មានទិន្នន័យអតិថិជន</p>
                ) : (
                  <div className="divide-y divide-[#F2EFE9]">
                    {customers.map((c) => (
                      <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#111111] truncate">{c.name}</p>
                          <p className="text-xs font-mono-num text-[#6B6559]">{c.phone}</p>
                          <p className="text-xs text-[#8A8478] truncate">{c.address}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold font-mono-num text-[#111111]">
                            ${c.totalSpentUsd.toFixed(2)}
                          </p>
                          <p className="text-[11px] text-[#6B6559]">
                            {c.totalOrders} ការបញ្ជាទិញ
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="h-4 w-4 text-[#B8860B]" />
                  <h2 className="text-sm font-semibold text-[#111111]">
                    ប្រវត្តិការទូទាត់ ABA PayWay ({payments.length})
                  </h2>
                </div>
                {payments.length === 0 ? (
                  <p className="text-xs text-[#6B6559] py-6 text-center">មិនទាន់មានប្រវត្តិទូទាត់</p>
                ) : (
                  <div className="divide-y divide-[#F2EFE9]">
                    {payments.map((pay) => (
                      <div key={pay.id} className="py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono-num font-semibold text-[#111111]">
                            {pay.orderNumber}
                          </span>
                          <span
                            className={`font-semibold uppercase ${
                              pay.status === 'paid'
                                ? 'text-emerald-700'
                                : pay.status === 'failed'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {pay.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#6B6559]">
                          <span className="font-mono-num">TranID: {pay.tranId}</span>
                          <span className="font-mono-num font-semibold text-[#111111]">
                            ${pay.amountUsd.toFixed(2)}
                          </span>
                        </div>
                        {pay.statusDetail && (
                          <p className="text-[11px] text-[#8A8478]">{pay.statusDetail}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY, RBAC, TELEGRAM & DATABASE BACKUPS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Integration Status & Telegram Test */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-[#111111]">
                    ស្ថានភាពការភ្ជាប់ API ផ្លូវការ
                  </h2>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-[#F2EFE9]">
                      <span className="text-[#6B6559]">Cloud Database (Firestore)</span>
                      <span className="font-semibold text-emerald-700">បានភ្ជាប់អចិន្ត្រៃយ៍</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-[#F2EFE9]">
                      <span className="text-[#6B6559]">ABA PayWay Merchant API</span>
                      <span
                        className={`font-semibold ${
                          stats?.integrations.abaConfigured ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {stats?.integrations.abaConfigured
                          ? 'បានកំណត់រួចរាល់'
                          : 'រង់ចាំ Merchant Key ក្នុង .env'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-[#6B6559]">Telegram Bot Notification</span>
                      <span
                        className={`font-semibold ${
                          stats?.integrations.telegramConfigured
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {stats?.integrations.telegramConfigured
                          ? 'បានភ្ជាប់រួចរាល់'
                          : 'រង់ចាំ Bot Token ក្នុង .env'}
                      </span>
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={handleTestTelegram}
                      className="flex h-10 items-center gap-2 rounded-xl border border-[#111111] px-4 text-xs font-semibold text-[#111111] hover:bg-[#FAF9F6]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>សាកល្បងផ្ញើសារ Telegram Bot</span>
                    </button>
                  )}
                </div>

                {/* Database Backups */}
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#111111]">
                      ប្រព័ន្ធ Backup Database ជាប្រចាំ
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageProducts && (
                      <button
                        type="button"
                        onClick={handleRunManualBackup}
                        className="flex h-10 items-center gap-2 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white"
                      >
                        <Database className="h-3.5 w-3.5 text-[#C9A227]" />
                        <span>បង្កើត Backup ឥឡូវនេះ</span>
                      </button>
                    )}
                    {canManageProducts && (
                      <button
                        type="button"
                        onClick={handleDownloadBackupJson}
                        className="flex h-10 items-center gap-2 rounded-xl border border-[#E2DDD3] px-4 text-xs font-semibold text-[#111111] hover:border-[#111111]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>ទាញយក JSON Backup</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 max-h-48 overflow-y-auto">
                    {backups.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-xl bg-[#FAF9F6] px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-[#111111]">
                            {formatDateTimeKm(b.createdAt)}
                          </p>
                          <p className="text-[11px] text-[#6B6559]">
                            {b.trigger === 'auto_scheduled' ? 'Auto 24h' : 'Manual'} · ដោយ {b.createdBy}
                          </p>
                        </div>
                        <span className="font-mono-num text-[11px] text-[#4A463E]">
                          {b.productCount}P / {b.orderCount}O
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RBAC Admin Users Management (Super Admin Only) */}
              {isSuperAdmin && (
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-[#111111]">
                    គ្រប់គ្រងអ្នកប្រើប្រាស់ និងសិទ្ធិ (Role-Based Access Control)
                  </h2>

                  <form
                    onSubmit={handleCreateAdminUser}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"
                  >
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Username"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs"
                    />
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="ឈ្មោះបង្ហាញ"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Password (>=8 តួ)"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs"
                    />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as AdminRole)}
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs"
                    >
                      <option value="manager">Manager (ផលិតផល & ការបញ្ជាទិញ)</option>
                      <option value="staff">Staff (មើល & ដឹកជញ្ជូន)</option>
                      <option value="super_admin">Super Admin (សិទ្ធិពេញ)</option>
                    </select>
                    <button
                      type="submit"
                      className="h-11 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white"
                    >
                      បង្កើតគណនី Admin
                    </button>
                  </form>

                  <div className="divide-y divide-[#F2EFE9]">
                    {adminUsers.map((u) => (
                      <div
                        key={u.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[#111111]">
                            {u.displayName}{' '}
                            <span className="font-mono-num text-[#6B6559]">(@{u.username})</span>
                          </p>
                          <p className="text-[11px] text-[#8A8478]">Role: {u.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAdminActive(u)}
                          className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                            u.active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}
                        >
                          {u.active ? 'សកម្ម (Active)' : 'ផ្អាក (Disabled)'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Product Add/Edit Modal */}
      <AdminProductFormModal
        key={editingProduct?.id || (productModalOpen ? 'new' : 'closed')}
        open={productModalOpen}
        editingProduct={editingProduct}
        authToken={authToken}
        onClose={() => setProductModalOpen(false)}
        onSaved={() => {
          setActionMsg(
            editingProduct
              ? 'បានកែប្រែព័ត៌មានផលិតផលដោយជោគជ័យ'
              : 'បានបន្ថែមផលិតផលថ្មីចូល Database រួចរាល់'
          );
          void loadAllAdminData();
        }}
      />
    </div>
  );
}
