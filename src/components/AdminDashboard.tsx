import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  BarChart3,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FolderPlus,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  Package,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
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
  Category,
  Coupon,
  CustomerRecord,
  DashboardStats,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  StoreSettings,
} from '../types/shop.ts';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import {
  compressImageToWebP,
  formatDateTimeKm,
  formatDualMoney,
  getCategoryLabel,
  getPaymentMethodLabel,
  ORDER_STATUS_LABELS,
} from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';
import { AdminProductFormModal } from './AdminProductFormModal.tsx';
import { OrderProgressTimeline } from './OrderProgressTimeline.tsx';
import { LocationMapPicker } from './LocationMapPicker.tsx';
import { playOrderAlertChime } from '../utils/orderHistory.ts';
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsUrl } from '../utils/mapsConfig.ts';
import {
  compressImageToBoundedDataUrl,
  createBackupSnapshotInFirestore,
  createCategoryInFirestore,
  createCouponInFirestore,
  deleteCategoryInFirestore,
  deleteCouponInFirestore,
  deleteProductInFirestore,
  loadAdminDashboardFromFirestore,
  saveSettingsInFirestore,
  subscribeAdminOrderEventsInFirestore,
  toggleCouponInFirestore,
  toggleProductStockInFirestore,
  updateCategoryInFirestore,
  updateOrderStatusInFirestore,
  verifyAdminFirebaseUser,
} from '../services/firestoreShop.ts';

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

type AdminTab = 'overview' | 'products' | 'orders' | 'customers' | 'coupons' | 'security';

export function AdminDashboard({ onNavigateStore }: AdminDashboardProps) {
  const [authLoading, setAuthLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('oudom_admin_token');
    } catch {
      return null;
    }
  });

  const [cloudMode, setCloudMode] = useState(false);

  // Login form state (2-layer: Username + Password)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [settingsForm, setSettingsForm] = useState<StoreSettings | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);

  const [dataLoading, setDataLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Dynamic Category Manager state
  const [catNameKm, setCatNameKm] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catEditNameKm, setCatEditNameKm] = useState('');
  const [catEditNameEn, setCatEditNameEn] = useState('');

  // Coupon Creator state
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponValue, setCouponValue] = useState('10');
  const [couponMinOrder, setCouponMinOrder] = useState('25');
  const [couponMaxUses, setCouponMaxUses] = useState('100');
  const [couponBusy, setCouponBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [qrUploadingField, setQrUploadingField] = useState<'usd' | 'khr' | null>(null);

  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [viewingSlipOrder, setViewingSlipOrder] = useState<Order | null>(null);
  const [viewingLocationOrder, setViewingLocationOrder] = useState<Order | null>(null);

  // Order Notification Bell & Live Sync state
  const [bellOpen, setBellOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('oudom_admin_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [seenOrderMap, setSeenOrderMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('oudom_admin_seen_orders_v1');
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [liveOrderAlert, setLiveOrderAlert] = useState<{
    order: Order;
    kind: 'new_order' | 'payment_slip';
  } | null>(null);
  const baselineReadyRef = useRef(false);
  const prevOrderFingerprintsRef = useRef<Record<string, string>>({});

  // Customer History & Tracking state
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // New Admin User Form (Super Admin only)
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('manager');

  const authHeaders = useCallback((): Record<string, string> => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }, [authToken]);

  const loadAllAdminData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setDataLoading(true);
      setActionError('');
    }
    try {
      if (cloudMode) {
        const cloud = await loadAdminDashboardFromFirestore();
        setStats(cloud.stats);
        setCategories(cloud.categories);
        setProducts(cloud.products);
        setOrders(cloud.orders);
        setCustomers(cloud.customers);
        setPayments(cloud.payments);
        setCoupons(cloud.coupons);
        setSettingsForm(cloud.settings);
        setBackups(cloud.backups);
        setAdminUsers(cloud.adminUsers);
        return;
      }

      const headers = authHeaders();
      const [statsRes, catRes, prodRes, ordRes, custRes, payRes, cpnRes, setRes, bkpRes] =
        await Promise.all([
          fetch(apiUrl('/api/admin/stats'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/categories'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/products'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/orders'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/customers'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/payments'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/coupons'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/settings'), { headers, credentials: 'include' }),
          fetch(apiUrl('/api/admin/backups'), { headers, credentials: 'include' }),
        ]);

      if (statsRes.ok) {
        const d = (await statsRes.json()) as { stats: DashboardStats };
        setStats(d.stats);
      }
      if (catRes.ok) {
        const d = (await catRes.json()) as { categories: Category[] };
        setCategories(d.categories);
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
      if (cpnRes.ok) {
        const d = (await cpnRes.json()) as { coupons: Coupon[] };
        setCoupons(d.coupons);
      }
      if (setRes.ok) {
        const d = (await setRes.json()) as { settings: StoreSettings };
        setSettingsForm(d.settings);
      }
      if (bkpRes.ok) {
        const d = (await bkpRes.json()) as { backups: BackupSnapshot[] };
        setBackups(d.backups);
      }

      if (adminUser?.role === 'super_admin') {
        const usersRes = await fetch(apiUrl('/api/admin/users'), { headers, credentials: 'include' });
        if (usersRes.ok) {
          const d = (await usersRes.json()) as { users: AdminUser[] };
          setAdminUsers(d.users);
        }
      }
    } catch {
      if (!opts?.silent) {
        setActionError('មិនអាចទាញយកទិន្នន័យគ្រប់គ្រងបានទេ');
      }
    } finally {
      if (!opts?.silent) {
        setDataLoading(false);
      }
    }
  }, [authHeaders, adminUser?.role, cloudMode]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/me'), {
          headers: authHeaders(),
          credentials: 'include',
        });
        const ct = res.headers.get('content-type') || '';
        if (ct.toLowerCase().includes('application/json')) {
          if (res.ok) {
            const data = await safeReadJson<{ user: AdminSessionUser }>(res);
            if (active && data?.user) setAdminUser(data.user);
          }
          if (active) setAuthLoading(false);
          return;
        }
        // Static / GitHub Pages host -> Serverless Firebase Cloud Online Mode
        if (active) setCloudMode(true);
      } catch {
        if (active) setCloudMode(true);
      }

      const unsub = onAuthStateChanged(auth, async (fbUser) => {
        if (!active) return;
        if (fbUser) {
          const check = await verifyAdminFirebaseUser(fbUser);
          if (check.authorized) {
            setAdminUser({
              id: fbUser.uid,
              username: (fbUser.email || 'admin').split('@')[0],
              displayName: fbUser.displayName || fbUser.email || 'Oudom Admin',
              role: check.role,
              email: fbUser.email || undefined,
            });
          } else {
            await signOut(auth);
            setAdminUser(null);
          }
        }
        setAuthLoading(false);
      });

      return unsub;
    };

    const cleanupPromise = checkSession();
    return () => {
      active = false;
      void cleanupPromise.then((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [authHeaders]);

  useEffect(() => {
    if (!adminUser) {
      baselineReadyRef.current = false;
      prevOrderFingerprintsRef.current = {};
      return;
    }

    void loadAllAdminData();

    if (cloudMode) {
      const unsub = subscribeAdminOrderEventsInFirestore(
        () => {
          void loadAllAdminData({ silent: true });
        },
        (err) => {
          console.warn('Live order subscription error:', err);
        }
      );
      return () => unsub();
    }

    const timer = window.setInterval(() => {
      void loadAllAdminData({ silent: true });
    }, 9000);
    return () => window.clearInterval(timer);
  }, [adminUser, cloudMode, loadAllAdminData]);

  // Detect new orders / payment slip uploads & update Notification Bell
  useEffect(() => {
    if (!adminUser || orders.length === 0) return;

    const getFingerprint = (o: Order) =>
      o.paymentSubmittedAt ? `slip:${o.paymentSubmittedAt}` : `order:${o.createdAt}`;

    const currentMap: Record<string, string> = {};
    for (const o of orders) {
      currentMap[o.id] = getFingerprint(o);
    }

    if (!baselineReadyRef.current) {
      baselineReadyRef.current = true;
      prevOrderFingerprintsRef.current = currentMap;

      // On first visit with empty seen storage, auto-mark old finalized orders as seen
      // while leaving pending orders visible in the bell dropdown
      let hasSavedSeen = false;
      try {
        hasSavedSeen = Boolean(localStorage.getItem('oudom_admin_seen_orders_v1'));
      } catch {
        hasSavedSeen = false;
      }
      if (!hasSavedSeen) {
        const initialSeen: Record<string, string> = {};
        for (const o of orders) {
          if (o.orderStatus !== 'pending') {
            initialSeen[o.id] = getFingerprint(o);
          }
        }
        setSeenOrderMap(initialSeen);
        try {
          localStorage.setItem('oudom_admin_seen_orders_v1', JSON.stringify(initialSeen));
        } catch {
          // Ignore storage quota
        }
      }
      return;
    }

    const prevMap = prevOrderFingerprintsRef.current;
    let detectedAlert: { order: Order; kind: 'new_order' | 'payment_slip' } | null = null;

    for (const o of orders) {
      const fp = currentMap[o.id];
      const prevFp = prevMap[o.id];
      if (!prevFp) {
        detectedAlert = { order: o, kind: 'new_order' };
        break;
      }
      if (prevFp !== fp && fp.startsWith('slip:')) {
        detectedAlert = { order: o, kind: 'payment_slip' };
        break;
      }
    }

    prevOrderFingerprintsRef.current = currentMap;

    if (detectedAlert) {
      setLiveOrderAlert(detectedAlert);
      if (soundEnabled) {
        playOrderAlertChime();
      }
    }
  }, [adminUser, orders, soundEnabled]);

  const persistSeenOrders = useCallback((next: Record<string, string>) => {
    setSeenOrderMap(next);
    try {
      localStorage.setItem('oudom_admin_seen_orders_v1', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  }, []);

  const unreadNotifications = useMemo(() => {
    return orders.filter((o) => {
      const fp = o.paymentSubmittedAt ? `slip:${o.paymentSubmittedAt}` : `order:${o.createdAt}`;
      return seenOrderMap[o.id] !== fp;
    });
  }, [orders, seenOrderMap]);

  const recentNotificationOrders = useMemo(() => {
    return orders.slice(0, 12);
  }, [orders]);

  const markOrderNotificationRead = useCallback(
    (o: Order) => {
      const fp = o.paymentSubmittedAt ? `slip:${o.paymentSubmittedAt}` : `order:${o.createdAt}`;
      persistSeenOrders({ ...seenOrderMap, [o.id]: fp });
    },
    [persistSeenOrders, seenOrderMap]
  );

  const markAllNotificationsRead = useCallback(() => {
    const next: Record<string, string> = { ...seenOrderMap };
    for (const o of orders) {
      next[o.id] = o.paymentSubmittedAt ? `slip:${o.paymentSubmittedAt}` : `order:${o.createdAt}`;
    }
    persistSeenOrders(next);
  }, [orders, persistSeenOrders, seenOrderMap]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem('oudom_admin_sound_enabled', String(next));
    } catch {
      // Ignore storage error
    }
    if (next) playOrderAlertChime();
  };

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (cloudMode) {
      setLoginError(
        'នៅលើវេបសាយ Online (Firebase Cloud) សូមចុចប៊ូតុង «ចូលដោយប្រើគណនី Google (Super Admin)» ខាងក្រោម ដើម្បីផ្ទៀងផ្ទាត់សិទ្ធិម្ចាស់ហាង។'
      );
      return;
    }

    setLoginBusy(true);
    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const data = await safeReadJson<{
        user?: AdminSessionUser;
        token?: string;
        error?: string;
      }>(res);
      if (!data) {
        setCloudMode(true);
        setLoginError(
          'សូមចុចប៊ូតុង «ចូលដោយប្រើគណនី Google (Super Admin)» ខាងក្រោម ដើម្បីចូលគ្រប់គ្រងហាងលើ Firebase Cloud។'
        );
        return;
      }
      if (!res.ok || !data.user) {
        setLoginError(data.error || 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ');
        return;
      }
      if (data.token) {
        try {
          sessionStorage.setItem('oudom_admin_token', data.token);
        } catch {
          // Ignore storage error
        }
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
    setLoginError('');
    setLoginBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);

      if (cloudMode) {
        const check = await verifyAdminFirebaseUser(cred.user);
        if (!check.authorized) {
          await signOut(auth);
          setLoginError(
            `គណនី Google (${cred.user.email || 'Unknown'}) មិនមានសិទ្ធិ Admin ទេ (អនុញ្ញាតតែម្ចាស់ហាងប៉ុណ្ណោះ)។`
          );
          return;
        }
        setAdminUser({
          id: cred.user.uid,
          username: (cred.user.email || 'admin').split('@')[0],
          displayName: cred.user.displayName || cred.user.email || 'Oudom Super Admin',
          role: check.role,
          email: cred.user.email || undefined,
        });
        return;
      }

      const idToken = await cred.user.getIdToken();
      const res = await fetch(apiUrl('/api/admin/google-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      const data = await safeReadJson<{
        user?: AdminSessionUser;
        token?: string;
        error?: string;
      }>(res);
      if (!data) {
        setCloudMode(true);
        const check = await verifyAdminFirebaseUser(cred.user);
        if (!check.authorized) {
          await signOut(auth);
          setLoginError('គណនី Google នេះមិនមានសិទ្ធិ Admin ទេ');
          return;
        }
        setAdminUser({
          id: cred.user.uid,
          username: (cred.user.email || 'admin').split('@')[0],
          displayName: cred.user.displayName || cred.user.email || 'Oudom Super Admin',
          role: check.role,
          email: cred.user.email || undefined,
        });
        return;
      }
      if (!res.ok || !data.user) {
        setLoginError(data.error || 'គណនី Google នេះមិនមានសិទ្ធិ Admin ទេ');
        return;
      }
      if (data.token) {
        try {
          sessionStorage.setItem('oudom_admin_token', data.token);
        } catch {
          // Ignore storage error
        }
      }
      setAuthToken(data.token || null);
      setAdminUser(data.user);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'github.io';
        setLoginError(
          `សូមបន្ថែម Domain "${host}" ទៅក្នុង Firebase Console → Authentication → Settings → Authorized domains ជាមុនសិន។`
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setLoginError('អ្នកបានបិទផ្ទាំងចូលគណនី Google មុនពេលបញ្ចប់។');
      } else {
        setLoginError('ការចូលដោយប្រើ Google បរាជ័យ');
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!cloudMode) {
      await fetch(apiUrl('/api/admin/logout'), { method: 'POST', credentials: 'include' }).catch(
        () => {}
      );
    } else {
      await signOut(auth).catch(() => {});
    }
    try {
      sessionStorage.removeItem('oudom_admin_token');
    } catch {
      // Ignore storage error
    }
    setAdminUser(null);
    setAuthToken(null);
    setPassword('');
  };

  const handleDeleteProduct = async (id: string) => {
    setActionError('');
    if (cloudMode) {
      try {
        await deleteProductInFirestore(id);
        setDeleteConfirmId(null);
        setActionMsg('បានលុបផលិតផលដោយជោគជ័យ');
        void loadAllAdminData();
      } catch {
        setActionError('មិនអាចលុបផលិតផលបានទេ');
      }
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/products/${id}`), {
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
    if (cloudMode) {
      await toggleProductStockInFirestore(p);
      void loadAllAdminData();
      return;
    }
    const nextStatus = p.status === 'available' ? 'out_of_stock' : 'available';
    const res = await fetch(apiUrl(`/api/admin/products/${p.id}`), {
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
    if (orderStatus === 'completed') {
      setActionError('ការបញ្ជាក់បង្កាន់ដៃ (ដល់ដៃជោគជ័យ) គឺសម្រាប់តែភ្ញៀវដែលជាអ្នកកុម្ម៉ង់ប៉ុណ្ណោះ');
      return;
    }
    if (cloudMode) {
      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder) return;
      try {
        await updateOrderStatusInFirestore(targetOrder, orderStatus);
        setActionMsg('បានធ្វើបច្ចុប្បន្នភាពស្ថានភាពការបញ្ជាទិញ');
        void loadAllAdminData();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'មិនអាចកែប្រែស្ថានភាពបានទេ');
      }
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/orders/${orderId}/status`), {
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
    if (cloudMode) {
      setActionError('នៅលើ Firebase Cloud Mode ការគ្រប់គ្រងគណនី Google ត្រូវបានការពារដោយ Super Admin ផ្ទាល់។');
      return;
    }
    const res = await fetch(apiUrl('/api/admin/users'), {
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
    if (cloudMode) return;
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}`), {
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
    if (cloudMode) {
      try {
        await createBackupSnapshotInFirestore(adminUser?.email || adminUser?.username || 'admin', {
          productCount: products.length,
          orderCount: orders.length,
          customerCount: customers.length,
          paymentCount: payments.length,
        });
        setActionMsg('បានរក្សាទុក Snapshot Backup ថ្មីក្នុង Cloud Firestore រួចរាល់');
        void loadAllAdminData();
      } catch {
        setActionError('បរាជ័យក្នុងការបង្កើត Backup');
      }
      return;
    }
    const res = await fetch(apiUrl('/api/admin/backups'), {
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
    if (cloudMode) {
      const payload = {
        exportedAt: new Date().toISOString(),
        categories,
        coupons,
        settings: settingsForm,
        products,
        orders,
        customers,
        payments,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oudom-shop-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const res = await fetch(apiUrl('/api/admin/backups/export'), {
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
    if (cloudMode) {
      setActionError('ការផ្ញើ Telegram Bot ស្វ័យប្រវត្តិដំណើរការតែពេលភ្ជាប់ជាមួយ Node.js Backend Server ប៉ុណ្ណោះ។');
      return;
    }
    const res = await fetch(apiUrl('/api/admin/telegram/test'), {
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

  // ---------------- DYNAMIC CATEGORIES HANDLERS ----------------
  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!catNameKm.trim()) return;
    setActionError('');
    setActionMsg('');
    setCatBusy(true);
    try {
      if (cloudMode) {
        const created = await createCategoryInFirestore(
          catNameKm.trim(),
          catNameEn.trim(),
          categories.length
        );
        setCatNameKm('');
        setCatNameEn('');
        setActionMsg(`បានបន្ថែមប្រភេទ "${created.nameKm}" រួចរាល់`);
        void loadAllAdminData();
        return;
      }
      const res = await fetch(apiUrl('/api/admin/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          nameKm: catNameKm.trim(),
          nameEn: catNameEn.trim(),
        }),
      });
      const data = (await res.json()) as { category?: Category; error?: string };
      if (!res.ok || !data.category) {
        setActionError(data.error || 'មិនអាចបន្ថែមប្រភេទទំនិញបានទេ');
      } else {
        setCatNameKm('');
        setCatNameEn('');
        setActionMsg(`បានបន្ថែមប្រភេទ "${data.category.nameKm}" រួចរាល់`);
        void loadAllAdminData();
      }
    } finally {
      setCatBusy(false);
    }
  };

  const handleSaveEditCategory = async (id: string) => {
    if (!catEditNameKm.trim()) return;
    setActionError('');
    setActionMsg('');
    if (cloudMode) {
      try {
        await updateCategoryInFirestore(id, catEditNameKm.trim(), catEditNameEn.trim());
        setCatEditingId(null);
        setActionMsg('បានកែប្រែឈ្មោះប្រភេទទំនិញរួចរាល់');
        void loadAllAdminData();
      } catch {
        setActionError('មិនអាចកែប្រែប្រភេទទំនិញបានទេ');
      }
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/categories/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        nameKm: catEditNameKm.trim(),
        nameEn: catEditNameEn.trim(),
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចកែប្រែប្រភេទទំនិញបានទេ');
    } else {
      setCatEditingId(null);
      setActionMsg('បានកែប្រែឈ្មោះប្រភេទទំនិញរួចរាល់');
      void loadAllAdminData();
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setActionError('');
    setActionMsg('');
    if (cloudMode) {
      try {
        await deleteCategoryInFirestore(id);
        setActionMsg('បានលុបប្រភេទទំនិញដោយជោគជ័យ');
        void loadAllAdminData();
      } catch {
        setActionError('មិនអាចលុបប្រភេទទំនិញបានទេ');
      }
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/categories/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
      credentials: 'include',
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setActionError(data.error || 'មិនអាចលុបប្រភេទទំនិញបានទេ');
    } else {
      setActionMsg('បានលុបប្រភេទទំនិញដោយជោគជ័យ');
      void loadAllAdminData();
    }
  };

  // ---------------- PROMO COUPONS & SETTINGS HANDLERS ----------------
  const handleCreateCoupon = async (e: FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionMsg('');
    setCouponBusy(true);
    try {
      if (cloudMode) {
        const created = await createCouponInFirestore({
          code: couponCode.trim().toUpperCase(),
          discountType: couponType,
          discountValue: Number(couponValue),
          minOrderUsd: Number(couponMinOrder || 0),
          maxUses: Number(couponMaxUses || 0),
        });
        setCouponCode('');
        setActionMsg(`បានបង្កើតកូដបញ្ចុះតម្លៃ "${created.code}" រួចរាល់`);
        void loadAllAdminData();
        return;
      }
      const res = await fetch(apiUrl('/api/admin/coupons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          discountType: couponType,
          discountValue: Number(couponValue),
          minOrderUsd: Number(couponMinOrder || 0),
          maxUses: Number(couponMaxUses || 0),
        }),
      });
      const data = (await res.json()) as { coupon?: Coupon; error?: string };
      if (!res.ok || !data.coupon) {
        setActionError(data.error || 'មិនអាចបង្កើតកូដបញ្ចុះតម្លៃបានទេ');
      } else {
        setCouponCode('');
        setActionMsg(`បានបង្កើតកូដបញ្ចុះតម្លៃ "${data.coupon.code}" រួចរាល់`);
        void loadAllAdminData();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'មិនអាចបង្កើតកូដបញ្ចុះតម្លៃបានទេ');
    } finally {
      setCouponBusy(false);
    }
  };

  const handleToggleCouponActive = async (coupon: Coupon) => {
    if (cloudMode) {
      await toggleCouponInFirestore(coupon);
      void loadAllAdminData();
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/coupons/${coupon.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ active: !coupon.active }),
    });
    if (res.ok) void loadAllAdminData();
  };

  const handleDeleteCoupon = async (id: string) => {
    if (cloudMode) {
      await deleteCouponInFirestore(id);
      setActionMsg('បានលុបកូដបញ្ចុះតម្លៃរួចរាល់');
      void loadAllAdminData();
      return;
    }
    const res = await fetch(apiUrl(`/api/admin/coupons/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (res.ok) {
      setActionMsg('បានលុបកូដបញ្ចុះតម្លៃរួចរាល់');
      void loadAllAdminData();
    }
  };

  const handleUploadQrImage = async (target: 'usd' | 'khr', e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settingsForm) return;
    setActionError('');
    setActionMsg('');
    setQrUploadingField(target);
    try {
      if (cloudMode) {
        const dataUrl = await compressImageToBoundedDataUrl(file, 760, 320000);
        setSettingsForm({
          ...settingsForm,
          ...(target === 'usd'
            ? { abaQrUsdImage: dataUrl }
            : { abaQrKhrImage: dataUrl }),
        });
        setActionMsg('បាន Upload រូបភាព KHQR រួចរាល់ — សូមចុច «រក្សាទុកការកំណត់ហាង» ដើម្បីអនុវត្តលើហាង!');
        return;
      }

      const optimized = await compressImageToWebP(file, 900);
      const formData = new FormData();
      formData.append('image', optimized);
      const res = await fetch(apiUrl('/api/admin/upload'), {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: formData,
      });
      const data = await safeReadJson<{ imageUrl?: string; error?: string }>(res);
      if (!data || !res.ok || !data.imageUrl) {
        setActionError(data?.error || 'បរាជ័យក្នុងការ Upload រូបភាព KHQR');
        return;
      }
      setSettingsForm({
        ...settingsForm,
        ...(target === 'usd'
          ? { abaQrUsdImage: data.imageUrl }
          : { abaQrKhrImage: data.imageUrl }),
      });
      setActionMsg('បាន Upload រូបភាព KHQR រួចរាល់ — សូមចុច «រក្សាទុកការកំណត់ហាង» ដើម្បីអនុវត្តលើហាង!');
    } catch {
      setActionError('មានបញ្ហាក្នុងការ Upload រូបភាព KHQR');
    } finally {
      setQrUploadingField(null);
      e.target.value = '';
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setActionError('');
    setActionMsg('');
    setSettingsBusy(true);
    try {
      if (cloudMode) {
        const updated = await saveSettingsInFirestore(settingsForm);
        setSettingsForm(updated);
        setActionMsg('បានរក្សាទុកការកំណត់ហាង និងបង្ហាញលើទំព័រដើមភ្លាមៗ!');
        void loadAllAdminData();
        return;
      }
      const res = await fetch(apiUrl('/api/admin/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify(settingsForm),
      });
      const data = (await res.json()) as { settings?: StoreSettings; error?: string };
      if (!res.ok || !data.settings) {
        setActionError(data.error || 'មិនអាចរក្សាទុកការកំណត់ហាងបានទេ');
      } else {
        setSettingsForm(data.settings);
        setActionMsg('បានរក្សាទុកការកំណត់ហាង និងបង្ហាញលើទំព័រដើមភ្លាមៗ!');
        void loadAllAdminData();
      }
    } finally {
      setSettingsBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6]">
        <Loader2 className="h-7 w-7 animate-spin text-[#111111]" />
      </div>
    );
  }

  // ---------------- LOGIN SCREEN (2-LAYER AUTH) ----------------
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

          {cloudMode ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-[#C9A227]/35 bg-[#C9A227]/10 p-3.5 text-xs text-[#F5DF98] leading-relaxed">
                <p className="font-semibold text-[#E5C158]">
                  ប្រព័ន្ធ Online · Firebase Cloud Database
                </p>
                <p className="mt-1 text-white/80">
                  ចូលដោយប្រើគណនី Google របស់ម្ចាស់ហាង ដើម្បីគ្រប់គ្រងទំនិញ ការបញ្ជាទិញ និងរូបភាព KHQR ផ្ទាល់តាម Online។
                </p>
              </div>

              {loginError && (
                <p className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 leading-relaxed">
                  {loginError}
                </p>
              )}

              <button
                type="button"
                onClick={handleGoogleAdminLogin}
                disabled={loginBusy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] text-sm font-bold text-[#0B0B0C] transition hover:bg-[#D4B038] disabled:opacity-50"
              >
                {loginBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                <span>ចូលដោយប្រើគណនី Google (ម្ចាស់ហាង)</span>
              </button>

              <p className="text-[11px] text-center text-white/45 leading-relaxed">
                ការពារសុវត្ថិភាព ២ ជាន់ · អនុញ្ញាតតែគណនី Google ដែលម្ចាស់ហាងបានកំណត់ប៉ុណ្ណោះ
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4">
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
                    placeholder="udom"
                    className="h-12 w-full rounded-xl border border-white/15 bg-[#0C0C0F] px-4 text-sm text-white placeholder:text-white/35 focus:border-[#C9A227] focus:outline-none [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#0c0c0f] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]"
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
                    className="h-12 w-full rounded-xl border border-white/15 bg-[#0C0C0F] px-4 text-sm text-white placeholder:text-white/35 focus:border-[#C9A227] focus:outline-none [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#0c0c0f] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]"
                  />
                </div>

                {loginError && (
                  <p className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 leading-relaxed">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] text-sm font-bold text-[#0B0B0C] transition hover:bg-[#D4B038] disabled:opacity-50"
                >
                  {loginBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>ចូលប្រព័ន្ធ Admin (២ ជាន់)</span>
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
                  ការពារសុវត្ថិភាព ២ ជាន់ · អនុញ្ញាតតែគណនីម្ចាស់ហាងដែលបានផ្ទៀងផ្ទាត់ប៉ុណ្ណោះ
                </p>
              </div>
            </>
          )}
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
    { key: 'products', label: 'ផលិតផល & ប្រភេទទំនិញ', icon: Package },
    { key: 'orders', label: 'ការបញ្ជាទិញ', icon: ShoppingCart },
    { key: 'customers', label: 'អតិថិជន & ទូទាត់', icon: Users },
    { key: 'coupons', label: 'ប្រូម៉ូសិន & កំណត់ហាង', icon: Tag },
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
            {/* Order Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((prev) => !prev)}
                aria-label="កណ្តឹងជូនដំណឹងការបញ្ជាទិញ"
                className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                  unreadNotifications.length > 0
                    ? 'border-[#C9A227] bg-[#C9A227]/10 text-[#111111]'
                    : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111] hover:border-[#111111]'
                }`}
              >
                {unreadNotifications.length > 0 ? (
                  <BellRing className="h-4 w-4 text-[#B8860B]" />
                ) : (
                  <Bell className="h-4 w-4 text-[#4A463E]" />
                )}
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold font-mono-num text-white shadow">
                    {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
                  </span>
                )}
              </button>

              {bellOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setBellOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-12 z-50 w-[calc(100vw-24px)] sm:w-96 rounded-2xl border border-[#E5E0D5] bg-white shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#ECE8DF] bg-[#FAF9F6] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-[#B8860B]" />
                        <span className="text-xs font-bold text-[#111111]">
                          កណ្តឹងជូនដំណឹងការបញ្ជាទិញ ({unreadNotifications.length} ថ្មី)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleToggleSound}
                          title={soundEnabled ? 'បិទសំឡេងរោទិ៍' : 'បើកសំឡេងរោទិ៍'}
                          className="flex h-7 items-center gap-1 rounded-md border border-[#E2DDD3] bg-white px-2 text-[11px] font-medium text-[#4A463E] hover:border-[#111111]"
                        >
                          {soundEnabled ? (
                            <Volume2 className="h-3.5 w-3.5 text-emerald-700" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5 text-[#8A8478]" />
                          )}
                          <span>{soundEnabled ? 'សំឡេង' : 'ស្ងាត់'}</span>
                        </button>
                        {unreadNotifications.length > 0 && (
                          <button
                            type="button"
                            onClick={markAllNotificationsRead}
                            className="flex h-7 items-center gap-1 rounded-md bg-[#111111] px-2 text-[11px] font-medium text-white hover:bg-[#262626]"
                          >
                            <CheckCheck className="h-3 w-3 text-[#C9A227]" />
                            <span>អានទាំងអស់</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[#F2EFE9]">
                      {recentNotificationOrders.length === 0 ? (
                        <p className="py-8 text-center text-xs text-[#6B6559]">
                          មិនទាន់មានការបញ្ជាទិញចូលមកទេ
                        </p>
                      ) : (
                        recentNotificationOrders.map((o) => {
                          const fp = o.paymentSubmittedAt
                            ? `slip:${o.paymentSubmittedAt}`
                            : `order:${o.createdAt}`;
                          const isUnread = seenOrderMap[o.id] !== fp;
                          const badge =
                            ORDER_STATUS_LABELS[o.orderStatus] || ORDER_STATUS_LABELS.pending;

                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                markOrderNotificationRead(o);
                                setOrderStatusFilter('all');
                                setOrderSearch(o.orderNumber);
                                setActiveTab('orders');
                                setBellOpen(false);
                              }}
                              className={`flex w-full items-start justify-between gap-2.5 px-4 py-3 text-left transition hover:bg-[#FAF9F6] ${
                                isUnread ? 'bg-[#C9A227]/8' : 'bg-white'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isUnread && (
                                    <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
                                  )}
                                  <span className="text-xs font-bold text-[#111111] truncate">
                                    {o.customerName}
                                  </span>
                                  <span className="font-mono-num text-[11px] text-[#6B6559]">
                                    ({o.customerPhone})
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#4A463E]">
                                  {o.paymentSubmittedAt
                                    ? 'បានផ្ញើវិក្កយបត្រផ្ទេរប្រាក់ · '
                                    : 'បានបញ្ជាទិញទំនិញថ្មី · '}
                                  <span className="font-mono-num font-semibold text-[#111111]">
                                    {o.orderNumber}
                                  </span>
                                </p>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.tone}`}
                                  >
                                    {badge.km}
                                  </span>
                                  <span className="text-[10px] text-[#8A8478]">
                                    {formatDateTimeKm(o.paymentSubmittedAt || o.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono-num text-xs font-bold text-[#111111]">
                                  ${o.totalUsd.toFixed(2)}
                                </p>
                                <p className="text-[10px] text-[#B8860B] font-medium mt-0.5">
                                  មើលលម្អិត →
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

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
                <span className="hidden sm:inline">បន្ថែមទំនិញ</span>
                <span className="sm:hidden">បន្ថែម</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 space-y-5 max-w-7xl w-full mx-auto">
          {liveOrderAlert && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C9A227] bg-[#111111] px-4 py-3 text-white shadow-lg">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C9A227] text-[#111111]">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#C9A227]">
                    {liveOrderAlert.kind === 'payment_slip'
                      ? 'អតិថិជនទើបផ្ញើវិក្កយបត្រទូទាត់ប្រាក់ថ្មី!'
                      : 'មានការបញ្ជាទិញថ្មីចូលមកហាង!'}
                  </p>
                  <p className="text-xs text-white/90 truncate">
                    {liveOrderAlert.order.customerName} ({liveOrderAlert.order.customerPhone}) ·{' '}
                    <span className="font-mono-num font-semibold">
                      {liveOrderAlert.order.orderNumber}
                    </span>{' '}
                    · <b className="font-mono-num">${liveOrderAlert.order.totalUsd.toFixed(2)}</b>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    markOrderNotificationRead(liveOrderAlert.order);
                    setOrderStatusFilter('all');
                    setOrderSearch(liveOrderAlert.order.orderNumber);
                    setActiveTab('orders');
                    setLiveOrderAlert(null);
                  }}
                  className="h-9 rounded-lg bg-[#C9A227] px-3 text-xs font-bold text-[#111111] hover:bg-[#D4B038]"
                >
                  ពិនិត្យ Order ឥឡូវ
                </button>
                <button
                  type="button"
                  aria-label="បិទ"
                  onClick={() => setLiveOrderAlert(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
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

          {/* TAB 2: PRODUCT & DYNAMIC CATEGORY MANAGEMENT */}
          {activeTab === 'products' && (
            <div className="space-y-5">
              {/* Dynamic Categories Manager */}
              <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FolderPlus className="h-4 w-4 text-[#B8860B]" />
                    <h2 className="text-sm font-semibold text-[#111111]">
                      គ្រប់គ្រងប្រភេទទំនិញ ({categories.length})
                    </h2>
                  </div>
                  <p className="text-[11px] text-[#6B6559]">
                    បន្ថែម ឬកែប្រែប្រភេទទំនិញ ហើយវានឹងបង្ហាញលើវេបសាយដោយស្វ័យប្រវត្តិ
                  </p>
                </div>

                {canManageProducts && (
                  <form
                    onSubmit={handleCreateCategory}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                  >
                    <input
                      type="text"
                      required
                      value={catNameKm}
                      onChange={(e) => setCatNameKm(e.target.value)}
                      placeholder="ឈ្មោះប្រភេទ (ខ្មែរ) ឧ. គ្រឿងសម្អាង"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-xs focus:border-[#111111] focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={catNameEn}
                      onChange={(e) => setCatNameEn(e.target.value)}
                      placeholder="English / Slug (ឧ. Cosmetics)"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-xs focus:border-[#111111] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={catBusy || !catNameKm.trim()}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#262626] disabled:opacity-45"
                    >
                      <Plus className="h-4 w-4 text-[#C9A227]" />
                      <span>{catBusy ? 'កំពុងបន្ថែម...' : 'បន្ថែមប្រភេទថ្មី'}</span>
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {categories.map((cat) => {
                    const count = products.filter((p) => p.category === cat.slug).length;
                    const isEditing = catEditingId === cat.id;

                    return (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-3"
                      >
                        {isEditing ? (
                          <div className="flex-1 space-y-1.5">
                            <input
                              type="text"
                              value={catEditNameKm}
                              onChange={(e) => setCatEditNameKm(e.target.value)}
                              className="h-9 w-full rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-xs"
                            />
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={catEditNameEn}
                                onChange={(e) => setCatEditNameEn(e.target.value)}
                                placeholder="English"
                                className="h-9 flex-1 rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-xs"
                              />
                              <button
                                type="button"
                                aria-label="រក្សាទុក"
                                onClick={() => void handleSaveEditCategory(cat.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#111111] text-white"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="បោះបង់"
                                onClick={() => setCatEditingId(null)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2DDD3] bg-white"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#111111] truncate">
                                {cat.nameKm}
                              </p>
                              <p className="text-[11px] font-mono-num text-[#6B6559] truncate">
                                {cat.slug} · {count} ផលិតផល
                              </p>
                            </div>
                            {canManageProducts && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  aria-label="កែប្រែប្រភេទ"
                                  onClick={() => {
                                    setCatEditingId(cat.id);
                                    setCatEditNameKm(cat.nameKm);
                                    setCatEditNameEn(cat.nameEn || '');
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2DDD3] bg-white text-[#111111] hover:border-[#111111]"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="លុបប្រភេទ"
                                  onClick={() => void handleDeleteCategory(cat.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                          {p.sku} · {getCategoryLabel(p.category, categories)}
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
                        <td className="px-4 py-3 text-xs">
                          {getCategoryLabel(p.category, categories)}
                        </td>
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
                            {order.paymentStatus.toUpperCase()} · {getPaymentMethodLabel(order.paymentMethod)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl bg-[#FAF9F6] p-3 text-xs">
                        <div>
                          <p className="font-semibold text-[#111111]">
                            អតិថិជន ({order.deliveryZone === 'province' ? 'តាមខេត្ត' : 'ភ្នំពេញ'})
                          </p>
                          <p className="mt-0.5 text-[#4A463E]">
                            {order.customerName} · {order.customerPhone}
                          </p>
                          <p className="mt-0.5 text-[#6B6559]">{order.shippingAddress}</p>
                          {(order.locationMapUrl ||
                            order.locationImageUrl ||
                            (order.locationLat != null && order.locationLng != null)) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {(order.locationMapUrl ||
                                (order.locationLat != null && order.locationLng != null)) && (
                                <a
                                  href={
                                    order.locationMapUrl ||
                                    buildGoogleMapsUrl(order.locationLat!, order.locationLng!)
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-[#E2DDD3] bg-white px-2 py-1 text-[11px] font-semibold text-[#005B7F] hover:border-[#005B7F]"
                                >
                                  <MapPin className="h-3 w-3 text-[#B8860B]" />
                                  <span>មើលទីតាំងលើ Map</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {order.locationLat != null && order.locationLng != null && (
                                <a
                                  href={buildGoogleMapsDirectionsUrl(
                                    order.locationLat,
                                    order.locationLng
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#111111] underline"
                                >
                                  ផ្លូវដឹកជញ្ជូន
                                </a>
                              )}
                              {order.locationImageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setViewingLocationOrder(order)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DDD3] bg-white px-2 py-1 text-[11px] font-semibold text-[#111111] hover:border-[#111111]"
                                >
                                  <SafeImage
                                    src={order.locationImageUrl}
                                    alt={`Location ${order.orderNumber}`}
                                    className="h-4 w-4 rounded object-cover"
                                  />
                                  <span>រូបភាពទីតាំង</span>
                                </button>
                              )}
                              {order.locationLat != null && order.locationLng != null && (
                                <span className="font-mono-num text-[10px] text-[#8A8478]">
                                  {order.locationLat.toFixed(5)}, {order.locationLng.toFixed(5)}
                                </span>
                              )}
                            </div>
                          )}
                          {order.couponCode && (
                            <p className="mt-1 font-mono-num text-emerald-800">
                              Promo: {order.couponCode} (-${(order.couponDiscountUsd || 0).toFixed(2)})
                            </p>
                          )}
                          {(order.paymentReference || order.paymentSlipUrl) && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#E2DDD3] bg-white p-2">
                              {order.paymentSlipUrl && (
                                <button
                                  type="button"
                                  onClick={() => setViewingSlipOrder(order)}
                                  className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-[#ECE8DF]"
                                >
                                  <SafeImage
                                    src={order.paymentSlipUrl}
                                    alt={`Slip ${order.orderNumber}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-[#005B7F]">
                                  ភស្តុតាងផ្ទេរប្រាក់ពីអតិថិជន
                                </p>
                                {order.paymentReference && (
                                  <p className="font-mono-num text-[11px] text-[#4A463E] truncate">
                                    Ref: {order.paymentReference}
                                  </p>
                                )}
                                {order.paymentSlipUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingSlipOrder(order)}
                                    className="text-[11px] font-semibold underline text-[#111111] mt-0.5"
                                  >
                                    មើលរូបភាពវិក្កយបត្រពេញ
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="flex h-10 items-center gap-1.5 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs font-medium text-[#111111] hover:border-[#111111]"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>បោះពុម្ពវិក្កយបត្រ</span>
                          </button>
                          {canManageProducts && order.paymentStatus !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => void handleUpdateOrderStatus(order.id, 'paid')}
                              className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>បញ្ជាក់បានទទួលប្រាក់ (Paid)</span>
                            </button>
                          )}
                          {(order.receiptConfirmed || order.orderStatus === 'completed') && (
                            <span className="inline-flex h-10 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800">
                              <Check className="h-3.5 w-3.5" />
                              <span>
                                ភ្ញៀវបានបញ្ជាក់បង្កាន់ដៃ
                                {order.receiptConfirmedAt
                                  ? ` (${formatDateTimeKm(order.receiptConfirmedAt)})`
                                  : ''}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <select
                            value={order.orderStatus}
                            disabled={Boolean(order.receiptConfirmed || order.orderStatus === 'completed')}
                            onChange={(e) =>
                              void handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                            }
                            className="h-10 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-semibold text-[#111111] disabled:opacity-60"
                          >
                            {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k} disabled={k === 'completed'}>
                                {k === 'completed'
                                  ? `${v.km} (ភ្ញៀវជាអ្នកបញ្ជាក់បង្កាន់ដៃ)`
                                  : `${v.km} (${v.en})`}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] text-[#8A8478]">
                            បញ្ជាក់បង្កាន់ដៃទទួលទំនិញ៖ សម្រាប់តែភ្ញៀវអ្នកកុម្ម៉ង់ប៉ុណ្ណោះ
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CUSTOMERS HISTORY, TRACKING & PAYMENT LOGS */}
          {activeTab === 'customers' && (() => {
            const q = customerSearch.trim().toLowerCase();
            const filteredCustomers = customers.filter((c) => {
              if (!q) return true;
              return (
                c.name.toLowerCase().includes(q) ||
                c.phone.toLowerCase().includes(q) ||
                c.address.toLowerCase().includes(q)
              );
            });
            const activeCustomer =
              filteredCustomers.find((c) => c.id === selectedCustomerId) ||
              filteredCustomers[0] ||
              null;

            const customerPhoneDigits = activeCustomer
              ? activeCustomer.phone.replace(/\D/g, '')
              : '';
            const activeCustomerOrders = activeCustomer
              ? orders.filter((o) => {
                  const oDigits = o.customerPhone.replace(/\D/g, '');
                  if (customerPhoneDigits && oDigits) {
                    return oDigits === customerPhoneDigits;
                  }
                  return o.customerId === activeCustomer.id || o.customerName === activeCustomer.name;
                })
              : [];

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Customer Directory List */}
                  <div className="lg:col-span-5 rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#B8860B]" />
                        <h2 className="text-sm font-semibold text-[#111111]">
                          បញ្ជីអតិថិជន ({filteredCustomers.length})
                        </h2>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A8478]" />
                      <input
                        type="search"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="ស្វែងរកឈ្មោះ ឬលេខទូរស័ព្ទអតិថិជន..."
                        className="h-10 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] pl-9 pr-3 text-xs focus:border-[#111111] focus:bg-white focus:outline-none"
                      />
                    </div>

                    {filteredCustomers.length === 0 ? (
                      <p className="text-xs text-[#6B6559] py-8 text-center">
                        មិនទាន់មានទិន្នន័យអតិថិជន
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[540px] overflow-y-auto pr-0.5">
                        {filteredCustomers.map((c) => {
                          const isSelected = activeCustomer?.id === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCustomerId(c.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                isSelected
                                  ? 'border-[#111111] bg-[#FAF9F6] ring-1 ring-[#111111]'
                                  : 'border-[#ECE8DF] bg-white hover:border-[#111111]'
                              }`}
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-sm font-semibold text-[#111111] truncate">
                                  {c.name}
                                </p>
                                <p className="text-xs font-mono-num text-[#6B6559]">{c.phone}</p>
                                <p className="text-[11px] text-[#8A8478] truncate">{c.address}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="text-xs font-bold font-mono-num text-[#111111]">
                                    ${c.totalSpentUsd.toFixed(2)}
                                  </p>
                                  <p className="text-[11px] text-[#6B6559]">
                                    {c.totalOrders} ការបញ្ជាទិញ
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-[#8A8478]" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Customer Order History & Delivery Stage Tracking */}
                  <div className="lg:col-span-7 rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#B8860B]" />
                      <h2 className="text-sm font-semibold text-[#111111]">
                        ប្រវត្តិទិញ និងតាមដានដំណាក់កាលទំនិញរបស់អ្នកទិញ
                      </h2>
                    </div>

                    {!activeCustomer ? (
                      <p className="text-xs text-[#6B6559] py-12 text-center">
                        សូមជ្រើសរើសអតិថិជនពីបញ្ជីខាងឆ្វេងដើម្បីមើលប្រវត្តិ និងស្ថានភាពទំនិញ
                      </p>
                    ) : (
                      <>
                        {/* Customer Summary Header */}
                        <div className="rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-bold text-[#111111]">
                              {activeCustomer.name}
                            </p>
                            <p className="text-xs font-mono-num text-[#4A463E]">
                              {activeCustomer.phone} · {activeCustomer.address}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-[11px] text-[#6B6559]">ចំនួនបញ្ជាទិញ</p>
                              <p className="font-mono-num text-sm font-bold text-[#111111]">
                                {activeCustomerOrders.length} ដង
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-[#6B6559]">សរុបបានទូទាត់</p>
                              <p className="font-mono-num text-sm font-bold text-[#9A6F04]">
                                ${activeCustomer.totalSpentUsd.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Customer Orders Timeline List */}
                        {activeCustomerOrders.length === 0 ? (
                          <p className="text-xs text-[#6B6559] py-8 text-center">
                            មិនមានការបញ្ជាទិញសម្រាប់អតិថិជននេះទេ
                          </p>
                        ) : (
                          <div className="space-y-4 max-h-[540px] overflow-y-auto pr-0.5">
                            {activeCustomerOrders.map((ord) => {
                              const badge =
                                ORDER_STATUS_LABELS[ord.orderStatus] || ORDER_STATUS_LABELS.pending;
                              return (
                                <div
                                  key={ord.id}
                                  className="rounded-xl border border-[#E5E0D5] bg-[#FAF9F6]/60 p-4 space-y-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono-num text-xs font-bold text-[#111111]">
                                          {ord.orderNumber}
                                        </span>
                                        <span
                                          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${badge.tone}`}
                                        >
                                          {badge.km}
                                        </span>
                                        <span className="font-mono-num text-xs font-bold text-[#9A6F04]">
                                          ${ord.totalUsd.toFixed(2)}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[#6B6559] mt-0.5">
                                        {formatDateTimeKm(ord.createdAt)} ·{' '}
                                        {getPaymentMethodLabel(ord.paymentMethod)}
                                      </p>
                                      {(ord.locationMapUrl ||
                                        ord.locationImageUrl ||
                                        (ord.locationLat != null && ord.locationLng != null)) && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2.5">
                                          {(ord.locationMapUrl ||
                                            (ord.locationLat != null && ord.locationLng != null)) && (
                                            <a
                                              href={
                                                ord.locationMapUrl ||
                                                buildGoogleMapsUrl(ord.locationLat!, ord.locationLng!)
                                              }
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#005B7F] underline"
                                            >
                                              <MapPin className="h-3 w-3 text-[#B8860B]" />
                                              <span>មើលទីតាំងលើ Google Maps</span>
                                              <ExternalLink className="h-3 w-3" />
                                            </a>
                                          )}
                                          {ord.locationImageUrl && (
                                            <button
                                              type="button"
                                              onClick={() => setViewingLocationOrder(ord)}
                                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111111] underline"
                                            >
                                              <SafeImage
                                                src={ord.locationImageUrl}
                                                alt={`Location ${ord.orderNumber}`}
                                                className="h-4 w-4 rounded object-cover"
                                              />
                                              <span>មើលរូបភាពទីតាំង</span>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <select
                                        value={ord.orderStatus}
                                        disabled={Boolean(ord.receiptConfirmed || ord.orderStatus === 'completed')}
                                        onChange={(e) =>
                                          void handleUpdateOrderStatus(
                                            ord.id,
                                            e.target.value as OrderStatus
                                          )
                                        }
                                        className="h-9 rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-xs font-semibold text-[#111111] disabled:opacity-60"
                                      >
                                        {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                                          <option key={k} value={k} disabled={k === 'completed'}>
                                            {k === 'completed'
                                              ? `${v.km} (ភ្ញៀវជាអ្នកបញ្ជាក់)`
                                              : `${v.km} (${v.en})`}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOrderStatusFilter('all');
                                          setOrderSearch(ord.orderNumber);
                                          setActiveTab('orders');
                                        }}
                                        className="h-9 rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-[11px] font-medium text-[#111111] hover:border-[#111111]"
                                      >
                                        គ្រប់គ្រងលម្អិត
                                      </button>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-[#ECE8DF] bg-white px-3 py-2 text-xs space-y-1">
                                    {ord.items.map((it, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span className="truncate pr-2 text-[#4A463E]">
                                          {it.name} × {it.quantity}
                                        </span>
                                        <span className="font-mono-num font-medium text-[#111111] shrink-0">
                                          ${it.lineTotalUsd.toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  <OrderProgressTimeline order={ord} compact />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ABA Payment History Log */}
                <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-4 w-4 text-[#B8860B]" />
                    <h2 className="text-sm font-semibold text-[#111111]">
                      ប្រវត្តិការទូទាត់ ({payments.length})
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
            );
          })()}

          {/* TAB 5: PROMO COUPONS & STORE SETTINGS */}
          {activeTab === 'coupons' && (
            <div className="space-y-6">
              {/* Promo Coupons Section */}
              <div className="rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[#B8860B]" />
                  <h2 className="text-sm font-semibold text-[#111111]">
                    គ្រប់គ្រងកូដបញ្ចុះតម្លៃ (Promo Coupons)
                  </h2>
                </div>

                {canManageProducts && (
                  <form
                    onSubmit={handleCreateCoupon}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5"
                  >
                    <input
                      type="text"
                      required
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="កូដ (ឧ. SALE15)"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-mono-num uppercase"
                    />
                    <select
                      value={couponType}
                      onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs"
                    >
                      <option value="percent">បញ្ចុះជា % (Percent)</option>
                      <option value="fixed">បញ្ចុះជា $ (Fixed)</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0.5"
                      required
                      value={couponValue}
                      onChange={(e) => setCouponValue(e.target.value)}
                      placeholder="ចំនួន (% ឬ $)"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-mono-num"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={couponMinOrder}
                      onChange={(e) => setCouponMinOrder(e.target.value)}
                      placeholder="ទិញយ៉ាងតិច ($)"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-mono-num"
                    />
                    <input
                      type="number"
                      min="0"
                      value={couponMaxUses}
                      onChange={(e) => setCouponMaxUses(e.target.value)}
                      placeholder="ចំនួនប្រើអតិបរមា"
                      className="h-11 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-xs font-mono-num"
                    />
                    <button
                      type="submit"
                      disabled={couponBusy}
                      className="h-11 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#262626] disabled:opacity-45"
                    >
                      {couponBusy ? 'កំពុងបង្កើត...' : 'បង្កើតកូដ'}
                    </button>
                  </form>
                )}

                <div className="divide-y divide-[#F2EFE9]">
                  {coupons.map((cpn) => (
                    <div
                      key={cpn.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-mono-num font-bold text-[#111111]">
                          {cpn.code}{' '}
                          <span className="font-normal text-[#9A6F04]">
                            (-
                            {cpn.discountType === 'percent'
                              ? `${cpn.discountValue}%`
                              : `$${cpn.discountValue}`}
                            )
                          </span>
                        </p>
                        <p className="text-[11px] text-[#6B6559] font-mono-num">
                          ទិញចាប់ពី ${cpn.minOrderUsd} · ប្រើបាន {cpn.usedCount}/
                          {cpn.maxUses || '∞'} ដង
                        </p>
                      </div>
                      {canManageProducts && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleCouponActive(cpn)}
                            className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                              cpn.active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-neutral-200 bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {cpn.active ? 'សកម្ម' : 'បានបិទ'}
                          </button>
                          <button
                            type="button"
                            aria-label="លុបកូដ"
                            onClick={() => void handleDeleteCoupon(cpn.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Storefront Settings Editor */}
              {settingsForm && (
                <form
                  onSubmit={handleSaveSettings}
                  className="rounded-2xl border border-[#E5E0D5] bg-white p-5 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-[#B8860B]" />
                    <h2 className="text-sm font-semibold text-[#111111]">
                      ការកំណត់ហាង Banner តម្លៃដឹកជញ្ជូន & អត្រាប្តូរប្រាក់
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">ឈ្មោះហាង</label>
                      <input
                        type="text"
                        value={settingsForm.shopName}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, shopName: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">
                        លេខទូរស័ព្ទទំនាក់ទំនង
                      </label>
                      <input
                        type="text"
                        value={settingsForm.contactPhone}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, contactPhone: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">
                        អាសយដ្ឋានហាង
                      </label>
                      <input
                        type="text"
                        value={settingsForm.contactAddress}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, contactAddress: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <LocationMapPicker
                        label="ទីតាំងហាងលើផែនទី (Store Map Location - បង្ហាញនៅ Footer)"
                        helperText="ជ្រើសទីតាំងហាងលើផែនទី Google Maps និងដាក់រូបភាពមុខហាង ដើម្បីឱ្យអតិថិជនងាយស្រួលស្វែងរក។"
                        lat={settingsForm.contactLat}
                        lng={settingsForm.contactLng}
                        mapUrl={settingsForm.contactMapUrl}
                        imageUrl={settingsForm.contactMapImageUrl}
                        mapHeightClass="h-52"
                        onChange={(loc) =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  contactLat: loc.lat,
                                  contactLng: loc.lng,
                                  contactMapUrl: loc.mapUrl,
                                  contactMapImageUrl: loc.imageUrl,
                                  contactAddress:
                                    loc.suggestedAddress && !prev.contactAddress.trim()
                                      ? loc.suggestedAddress
                                      : prev.contactAddress,
                                }
                              : prev
                          )
                        }
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block font-medium text-[#4A463E] mb-1">
                        របារសារផ្សព្វផ្សាយខាងលើ (Announcement Strip - ទុកទទេដើម្បីបិទ)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.announcementText}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, announcementText: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">
                        Hero Eyebrow Text
                      </label>
                      <input
                        type="text"
                        value={settingsForm.heroEyebrow}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, heroEyebrow: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-medium text-[#4A463E] mb-1">
                        ចំណងជើងធំ Hero Banner
                      </label>
                      <input
                        type="text"
                        value={settingsForm.heroTitle}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, heroTitle: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block font-medium text-[#4A463E] mb-1">
                        អត្ថបទពណ៌នា Hero Banner
                      </label>
                      <input
                        type="text"
                        value={settingsForm.heroSubtitle}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, heroSubtitle: e.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">
                        អត្រាប្តូរប្រាក់ (1 USD = ? ៛)
                      </label>
                      <input
                        type="number"
                        min="1000"
                        value={settingsForm.khrRate}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            khrRate: Number(e.target.value || 4100),
                          })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#4A463E] mb-1">
                        ដឹកជញ្ជូនឥតគិតថ្លៃចាប់ពី ($)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={settingsForm.freeShippingThresholdUsd}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            freeShippingThresholdUsd: Number(e.target.value || 0),
                          })
                        }
                        className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium text-[#4A463E] mb-1">
                          ភ្នំពេញ ($)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={settingsForm.phnomPenhShippingUsd}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              phnomPenhShippingUsd: Number(e.target.value || 0),
                            })
                          }
                          className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-[#4A463E] mb-1">
                          តាមខេត្ត ($)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={settingsForm.provinceShippingUsd}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              provinceShippingUsd: Number(e.target.value || 0),
                            })
                          }
                          className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-[#F2EFE9]">
                      <p className="font-semibold text-[#005B7F] mb-2">
                        ព័ត៌មានគណនី ABA Bank របស់ហាង (បង្ហាញពេលអតិថិជនទូទាត់)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="block font-medium text-[#4A463E] mb-1">
                            ឈ្មោះគណនី ABA
                          </label>
                          <input
                            type="text"
                            value={settingsForm.abaAccountName}
                            onChange={(e) =>
                              setSettingsForm({ ...settingsForm, abaAccountName: e.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-[#4A463E] mb-1">
                            លេខសម្គាល់ (ABA ID)
                          </label>
                          <input
                            type="text"
                            value={settingsForm.abaAccountId}
                            onChange={(e) =>
                              setSettingsForm({ ...settingsForm, abaAccountId: e.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-[#4A463E] mb-1">
                            លេខគណនី ($) USD
                          </label>
                          <input
                            type="text"
                            value={settingsForm.abaAccountUsd}
                            onChange={(e) =>
                              setSettingsForm({ ...settingsForm, abaAccountUsd: e.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-[#4A463E] mb-1">
                            លេខគណនី (៛) KHR
                          </label>
                          <input
                            type="text"
                            value={settingsForm.abaAccountKhr}
                            onChange={(e) =>
                              setSettingsForm({ ...settingsForm, abaAccountKhr: e.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 font-mono-num"
                          />
                        </div>
                      </div>

                      {/* Real Store KHQR Images Upload (USD & KHR) */}
                      <div className="mt-4 pt-4 border-t border-[#F2EFE9] grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-[#111111]">
                              <QrCode className="h-4 w-4 text-[#005B7F]" />
                              <span>រូបភាព KHQR ហាង ($ USD)</span>
                            </div>
                            {settingsForm.abaQrUsdImage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSettingsForm({ ...settingsForm, abaQrUsdImage: '' })
                                }
                                className="text-[11px] font-medium text-red-700 hover:underline"
                              >
                                លុបចេញ
                              </button>
                            )}
                          </div>
                          {settingsForm.abaQrUsdImage && (
                            <div className="w-36 overflow-hidden rounded-lg border border-[#E2DDD3] bg-white p-1.5">
                              <SafeImage
                                src={settingsForm.abaQrUsdImage}
                                alt="KHQR USD Preview"
                                className="h-auto w-full object-contain"
                              />
                            </div>
                          )}
                          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs font-medium text-[#111111] hover:border-[#111111]">
                            <Upload className="h-3.5 w-3.5 text-[#005B7F]" />
                            <span>
                              {qrUploadingField === 'usd'
                                ? 'កំពុង Upload...'
                                : 'Upload រូប KHQR (USD)'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={qrUploadingField === 'usd'}
                              onChange={(e) => void handleUploadQrImage('usd', e)}
                              className="hidden"
                            />
                          </label>
                          <p className="text-[11px] text-[#6B6559]">
                            Save រូប KHQR USD ពី ABA/Bakong App រួច Upload នៅទីនេះ ដើម្បីឱ្យភ្ញៀវស្កេនបង់លុយពិតផ្ទាល់។
                          </p>
                        </div>

                        <div className="rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-[#111111]">
                              <QrCode className="h-4 w-4 text-[#005B7F]" />
                              <span>រូបភាព KHQR ហាង (៛ KHR)</span>
                            </div>
                            {settingsForm.abaQrKhrImage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSettingsForm({ ...settingsForm, abaQrKhrImage: '' })
                                }
                                className="text-[11px] font-medium text-red-700 hover:underline"
                              >
                                លុបចេញ
                              </button>
                            )}
                          </div>
                          {settingsForm.abaQrKhrImage && (
                            <div className="w-36 overflow-hidden rounded-lg border border-[#E2DDD3] bg-white p-1.5">
                              <SafeImage
                                src={settingsForm.abaQrKhrImage}
                                alt="KHQR KHR Preview"
                                className="h-auto w-full object-contain"
                              />
                            </div>
                          )}
                          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs font-medium text-[#111111] hover:border-[#111111]">
                            <Upload className="h-3.5 w-3.5 text-[#005B7F]" />
                            <span>
                              {qrUploadingField === 'khr'
                                ? 'កំពុង Upload...'
                                : 'Upload រូប KHQR (KHR)'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={qrUploadingField === 'khr'}
                              onChange={(e) => void handleUploadQrImage('khr', e)}
                              className="hidden"
                            />
                          </label>
                          <p className="text-[11px] text-[#6B6559]">
                            បង្ហាញជូនភ្ញៀវដែលចង់ស្កេនទូទាត់ជាប្រាក់រៀល (KHR) តាម Bakong ឬគ្រប់ធនាគារ។
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {canManageProducts && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={settingsBusy}
                        className="h-11 rounded-xl bg-[#111111] px-6 text-xs font-semibold text-white hover:bg-[#262626] disabled:opacity-45"
                      >
                        {settingsBusy ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកការកំណត់ហាង'}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}

          {/* TAB 6: SECURITY, RBAC, TELEGRAM & DATABASE BACKUPS */}
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
        categories={categories}
        authToken={authToken}
        cloudMode={cloudMode}
        onClose={() => setProductModalOpen(false)}
        onCategoryCreated={(cat) => setCategories((prev) => [...prev, cat])}
        onSaved={() => {
          setActionMsg(
            editingProduct
              ? 'បានកែប្រែព័ត៌មានផលិតផលដោយជោគជ័យ'
              : 'បានបន្ថែមផលិតផលថ្មីចូល Database រួចរាល់'
          );
          void loadAllAdminData();
        }}
      />

      {/* Printable Order Receipt Modal */}
      {printingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:static print:bg-white print:p-0"
          onClick={() => setPrintingOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 print:shadow-none print:max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ECE8DF] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#111111]">
                  {settingsForm?.shopName || 'ឧត្តម Shop'} — វិក្កយបត្រ
                </h3>
                <p className="text-xs font-mono-num text-[#6B6559]">
                  {printingOrder.orderNumber} · {formatDateTimeKm(printingOrder.createdAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="បិទ"
                onClick={() => setPrintingOrder(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#FAF9F6] print:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs space-y-1 text-[#4A463E]">
              <p>
                អតិថិជន៖ <b className="text-[#111111]">{printingOrder.customerName}</b>
              </p>
              <p>ទូរស័ព្ទ៖ {printingOrder.customerPhone}</p>
              <p>
                ដឹកជញ្ជូន ({printingOrder.deliveryZone === 'province' ? 'តាមខេត្ត' : 'ភ្នំពេញ'})៖{' '}
                {printingOrder.shippingAddress}
              </p>
              {(printingOrder.locationMapUrl ||
                (printingOrder.locationLat != null && printingOrder.locationLng != null)) && (
                <p className="break-all">
                  ទីតាំងផែនទី៖{' '}
                  <a
                    href={
                      printingOrder.locationMapUrl ||
                      buildGoogleMapsUrl(
                        printingOrder.locationLat!,
                        printingOrder.locationLng!
                      )
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono-num text-[#005B7F] underline"
                  >
                    {printingOrder.locationMapUrl ||
                      buildGoogleMapsUrl(
                        printingOrder.locationLat!,
                        printingOrder.locationLng!
                      )}
                  </a>
                </p>
              )}
              {printingOrder.locationImageUrl && (
                <div className="pt-1">
                  <p className="text-[11px] font-medium text-[#6B6559] mb-1">
                    រូបភាពទីតាំងដឹកជញ្ជូន៖
                  </p>
                  <SafeImage
                    src={printingOrder.locationImageUrl}
                    alt={`Location ${printingOrder.orderNumber}`}
                    className="h-28 w-auto max-w-full rounded-lg border border-[#E2DDD3] object-cover"
                  />
                </div>
              )}
              {(printingOrder.receiptConfirmed || printingOrder.orderStatus === 'completed') && (
                <p className="text-emerald-800 font-semibold">
                  បង្កាន់ដៃទទួលទំនិញ៖ ភ្ញៀវបានបញ្ជាក់រួចរាល់
                  {printingOrder.receiptConfirmedAt
                    ? ` (${formatDateTimeKm(printingOrder.receiptConfirmedAt)})`
                    : ''}
                </p>
              )}
            </div>

            <div className="border-t border-b border-[#ECE8DF] py-3 space-y-1.5 text-xs">
              {printingOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="pr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-mono-num shrink-0">${item.lineTotalUsd.toFixed(2)}</span>
                </div>
              ))}
              {printingOrder.couponCode && (
                <div className="flex justify-between text-emerald-800">
                  <span>កូដបញ្ចុះតម្លៃ ({printingOrder.couponCode})</span>
                  <span className="font-mono-num">
                    -${(printingOrder.couponDiscountUsd || 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[#6B6559]">
                <span>ថ្លៃដឹកជញ្ជូន</span>
                <span className="font-mono-num">${printingOrder.shippingFeeUsd.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs font-semibold">សរុបត្រូវបង់</span>
              <span className="text-base font-bold font-mono-num">
                {formatDualMoney(printingOrder.totalUsd, stats?.khrRate || 4100)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <button
                type="button"
                onClick={() => setPrintingOrder(null)}
                className="h-10 rounded-xl border border-[#E2DDD3] px-4 text-xs font-medium"
              >
                បិទ
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>បោះពុម្ព (Print)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Size Customer Payment Slip Viewer Modal */}
      {viewingSlipOrder && viewingSlipOrder.paymentSlipUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 print:hidden"
          onClick={() => setViewingSlipOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ECE8DF] pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  វិក្កយបត្រផ្ទេរប្រាក់ · {viewingSlipOrder.orderNumber}
                </h3>
                <p className="text-xs text-[#6B6559]">
                  {viewingSlipOrder.customerName} ({viewingSlipOrder.customerPhone}) ·{' '}
                  <span className="font-mono-num font-semibold text-[#111111]">
                    ${viewingSlipOrder.totalUsd.toFixed(2)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                aria-label="បិទ"
                onClick={() => setViewingSlipOrder(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {viewingSlipOrder.paymentReference && (
              <p className="rounded-lg bg-[#FAF9F6] border border-[#E2DDD3] px-3 py-2 text-xs font-mono-num">
                លេខយោង៖ <b>{viewingSlipOrder.paymentReference}</b>
              </p>
            )}

            <div className="max-h-[65vh] overflow-auto rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-2">
              <SafeImage
                src={viewingSlipOrder.paymentSlipUrl}
                alt={`Payment Slip ${viewingSlipOrder.orderNumber}`}
                className="mx-auto h-auto max-w-full rounded-lg object-contain"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setViewingSlipOrder(null)}
                className="h-10 rounded-xl border border-[#E2DDD3] px-4 text-xs font-medium"
              >
                បិទ
              </button>
              {canManageProducts && viewingSlipOrder.paymentStatus !== 'paid' && (
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingSlipOrder.id;
                    setViewingSlipOrder(null);
                    void handleUpdateOrderStatus(id, 'paid');
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>បញ្ជាក់បានទទួលប្រាក់ (Paid)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Full-Size Customer Location Photo Viewer Modal */}
      {viewingLocationOrder && viewingLocationOrder.locationImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 print:hidden"
          onClick={() => setViewingLocationOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ECE8DF] pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  រូបភាពទីតាំងដឹកជញ្ជូន · {viewingLocationOrder.orderNumber}
                </h3>
                <p className="text-xs text-[#6B6559]">
                  {viewingLocationOrder.customerName} ({viewingLocationOrder.customerPhone})
                </p>
              </div>
              <button
                type="button"
                aria-label="បិទ"
                onClick={() => setViewingLocationOrder(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#4A463E]">{viewingLocationOrder.shippingAddress}</p>

            <div className="max-h-[60vh] overflow-auto rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-2">
              <SafeImage
                src={viewingLocationOrder.locationImageUrl}
                alt={`Location ${viewingLocationOrder.orderNumber}`}
                className="mx-auto h-auto max-w-full rounded-lg object-contain"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {(viewingLocationOrder.locationMapUrl ||
                (viewingLocationOrder.locationLat != null &&
                  viewingLocationOrder.locationLng != null)) && (
                <a
                  href={
                    viewingLocationOrder.locationMapUrl ||
                    buildGoogleMapsUrl(
                      viewingLocationOrder.locationLat!,
                      viewingLocationOrder.locationLng!
                    )
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#262626]"
                >
                  <MapPin className="h-3.5 w-3.5 text-[#C9A227]" />
                  <span>បើក Google Maps</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setViewingLocationOrder(null)}
                className="h-10 rounded-xl border border-[#E2DDD3] px-4 text-xs font-medium"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
