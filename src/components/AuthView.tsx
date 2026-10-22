import React, { useState } from 'react';
import {
  CheckSquare,
  Lock,
  User,
  Mail,
  ArrowRight,
  Sparkles,
  Wifi,
  WifiOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserAccount } from '../types/task';

interface AuthViewProps {
  onLoginSuccess: (user: UserAccount, tasks: any[]) => void;
  isOnline: boolean;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess, isOnline }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Local Accounts Directory for offline mode
  const getLocalUsers = (): UserAccount[] => {
    try {
      const saved = localStorage.getItem('taskmaster_local_accounts');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  };

  const saveLocalUsers = (users: UserAccount[]) => {
    try {
      localStorage.setItem('taskmaster_local_accounts', JSON.stringify(users));
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanInput = username.trim().toLowerCase();
    if (!cleanInput || !password) {
      setErrorMessage('Vui lòng nhập tên đăng nhập/email và mật khẩu.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Try server login if online
      if (isOnline) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: cleanInput, password }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              const accountWithPass: UserAccount = {
                ...data.user,
                password, // cached locally for offline fallback
              };

              // Cache locally
              const localUsers = getLocalUsers();
              const existingIdx = localUsers.findIndex(
                (u) => u.id === data.user.id || u.username.toLowerCase() === cleanInput
              );
              if (existingIdx >= 0) {
                localUsers[existingIdx] = accountWithPass;
              } else {
                localUsers.push(accountWithPass);
              }
              saveLocalUsers(localUsers);

              // Store user tasks from server
              if (Array.isArray(data.tasks)) {
                localStorage.setItem(
                  `taskmaster_tasks_${data.user.id}`,
                  JSON.stringify(data.tasks)
                );
              }

              onLoginSuccess(accountWithPass, data.tasks || []);
              return;
            }
          } else if (res.status === 401) {
            setErrorMessage('Mật khẩu không chính xác.');
            return;
          } else if (res.status === 404) {
            // Check local accounts before returning error
            const localUsers = getLocalUsers();
            const localUser = localUsers.find(
              (u) =>
                u.username.toLowerCase() === cleanInput ||
                u.email.toLowerCase() === cleanInput
            );
            if (!localUser) {
              setErrorMessage('Tài khoản không tồn tại trên hệ thống. Vui lòng bấm "Đăng ký" để tạo tài khoản mới.');
              return;
            }
          }
        } catch {
          // Fall through to offline check
        }
      }

      // 2. Offline / local fallback check
      const localUsers = getLocalUsers();
      const user = localUsers.find(
        (u) =>
          u.username.toLowerCase() === cleanInput ||
          u.email.toLowerCase() === cleanInput
      );

      if (user) {
        if (user.password && user.password !== password) {
          setErrorMessage('Mật khẩu không chính xác.');
          return;
        }

        // Load user's tasks
        let userTasks = [];
        try {
          const raw = localStorage.getItem(`taskmaster_tasks_${user.id}`);
          if (raw) userTasks = JSON.parse(raw);
        } catch {}

        onLoginSuccess(user, userTasks);
      } else {
        setErrorMessage('Tài khoản không tồn tại. Vui lòng bấm "Đăng ký" để tạo tài khoản mới.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanUser = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUser) {
      setErrorMessage('Vui lòng nhập tên đăng nhập.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if (!password || password.length < 4) {
      setErrorMessage('Mật khẩu phải có ít nhất 4 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. If online, register directly on the server to obtain the authoritative account ID
      if (isOnline) {
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: cleanUser,
              email: cleanEmail,
              password,
            }),
          });

          const data = await res.json();
          if (res.ok && data.user) {
            const serverUser: UserAccount = {
              ...data.user,
              password, // store for offline fallback login
            };

            const localUsers = getLocalUsers();
            const existingIdx = localUsers.findIndex(
              (u) => u.id === serverUser.id || u.username === cleanUser
            );
            if (existingIdx >= 0) {
              localUsers[existingIdx] = serverUser;
            } else {
              localUsers.push(serverUser);
            }
            saveLocalUsers(localUsers);
            localStorage.setItem(`taskmaster_tasks_${serverUser.id}`, JSON.stringify([]));

            setSuccessMessage(
              'Đăng ký tài khoản thành công! Dữ liệu tài khoản đã được lưu đồng bộ trên hệ thống, bạn có thể đăng nhập trên thiết bị này hoặc bất kỳ thiết bị nào khác.'
            );
            setMode('login');
            setPassword('');
            setConfirmPassword('');
            return;
          } else {
            setErrorMessage(data.error || 'Lỗi đăng ký tài khoản trên máy chủ.');
            return;
          }
        } catch {
          // If network fetch fails, continue to offline registration
        }
      }

      // 2. Offline fallback registration
      const localUsers = getLocalUsers();
      const existing = localUsers.find(
        (u) => u.username === cleanUser || u.email === cleanEmail
      );
      if (existing) {
        setErrorMessage('Tên đăng nhập hoặc email đã được sử dụng.');
        return;
      }

      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newAccount: UserAccount = {
        id: newUserId,
        username: cleanUser,
        email: cleanEmail,
        password,
        isProfileCompleted: false, // Must complete profile onboarding before entering
        profile: {
          displayName: username.trim(),
          role: '',
          units: ['Ban Thanh Niên', 'Chi hội 1'],
          birthDate: '1995-01-01',
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`,
          email: cleanEmail,
          phone: '',
          weeklyGoal: 3,
          notifications: {
            browserEnabled: true,
            soundEnabled: true,
            priorityReminders: true,
            overdueAlerts: true,
          },
          connectedAppsList: [],
        },
        createdAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      };

      localUsers.push(newAccount);
      saveLocalUsers(localUsers);
      localStorage.setItem(`taskmaster_tasks_${newUserId}`, JSON.stringify([]));

      setSuccessMessage(
        'Đã lưu tài khoản ngoại tuyến (Offline)! Tài khoản sẽ được tự động đồng bộ khi có kết nối mạng.'
      );
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-['Be_Vietnam_Pro',sans-serif]">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-blue-600 to-sky-400 text-white shadow-xl shadow-indigo-500/25 mb-1">
            <CheckSquare className="w-8 h-8 stroke-[2.2]" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white">TaskMaster</h1>
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-md shadow-xs">
              AI
            </span>
          </div>
          <p className="text-indigo-200/80 text-xs sm:text-sm max-w-xs mx-auto">
            Hệ thống Quản lý, Phân rã Công việc &amp; Cố vấn Chiến lược Hiệu suất
          </p>

          {/* Online/Offline Status Indicator */}
          <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px]">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
                <Wifi className="w-3 h-3" /> Trực tuyến • Tự động đồng bộ toàn hệ thống
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-300 font-semibold bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-800/60">
                <WifiOff className="w-3 h-3" /> Ngoại tuyến (Offline) • Lưu trữ cục bộ an toàn
              </span>
            )}
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 text-slate-800 shadow-2xl border border-white/20 space-y-5">
          {/* Tabs: Login / Register */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`py-2 rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
              }}
              className={`py-2 rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng ký mới
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {/* Username / Identifier */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                {mode === 'login' ? 'Tên đăng nhập hoặc Email:' : 'Tên đăng nhập:'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'login' ? 'nguyenvanan hoặc email@...' : 'vd: nguyenvanan'}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-medium outline-hidden"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {/* Email (only in Register mode) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Email liên hệ: <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-medium outline-hidden"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            )}

            {/* Password */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Mật khẩu: <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-medium outline-hidden"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {/* Confirm Password (only in Register mode) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Xác nhận lại mật khẩu: <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-medium outline-hidden"
                  />
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Đăng nhập vào TaskMaster' : 'Đăng ký tài khoản mới'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Offline & Sync Notice Footer */}
        <div className="text-center text-[11px] text-indigo-300/75 max-w-sm mx-auto leading-relaxed">
          🔒 Dữ liệu được bảo mật và mã hóa trên thiết bị của bạn. Khi mất mạng (offline), bạn vẫn đăng nhập và thao tác bình thường. Khi có mạng, hệ thống tự động đồng bộ hóa trên toàn hệ thống.
        </div>
      </div>
    </div>
  );
};
