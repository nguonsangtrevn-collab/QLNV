import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ActiveTaskList } from './components/ActiveTaskList';
import { ArchiveVault } from './components/ArchiveVault';
import { AIAdvisor } from './components/AIAdvisor';
import { ProfileView } from './components/ProfileView';
import { TaskFormModal } from './components/TaskFormModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { AuthView } from './components/AuthView';
import { ProfileOnboardingModal } from './components/ProfileOnboardingModal';
import { Task, UserProfile, UserAccount } from './types/task';
import { getTaskStatus } from './utils/taskCalculations';
import { playNotificationSound, sendBrowserNotification } from './utils/audioNotification';

export default function App() {
  // 1. Online / Offline Status
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);

  // 2. Active User Account
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const savedUser = localStorage.getItem('taskmaster_current_user');
      if (savedUser) return JSON.parse(savedUser);
    } catch {}
    return null;
  });

  // 3. User's Tasks (Isolated per user, empty [] for new users)
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const savedUser = localStorage.getItem('taskmaster_current_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const savedTasks = localStorage.getItem(`taskmaster_tasks_${parsed.id}`);
        if (savedTasks) return JSON.parse(savedTasks);
      }
    } catch {}
    return [];
  });

  // 4. User Profile
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    if (currentUser?.profile) {
      return currentUser.profile;
    }
    return {
      displayName: 'Cán bộ',
      role: 'Cán bộ phụ trách',
      units: ['Ban Thanh Niên', 'Chi hội 1'],
      birthDate: '1996-01-01',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      weeklyGoal: 4,
      notifications: {
        browserEnabled: true,
        soundEnabled: true,
        priorityReminders: true,
        overdueAlerts: true,
      },
      connectedAppsList: [],
    };
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(
    userProfile.notifications?.soundEnabled ?? true
  );

  // Sync tasks to localStorage per user
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`taskmaster_tasks_${currentUser.id}`, JSON.stringify(tasks));
    }
  }, [tasks, currentUser]);

  // Sync profile to localStorage
  useEffect(() => {
    if (currentUser) {
      const updatedUser: UserAccount = {
        ...currentUser,
        profile: userProfile,
      };
      localStorage.setItem('taskmaster_current_user', JSON.stringify(updatedUser));
    }
  }, [userProfile, currentUser]);

  // Online / Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser, tasks, userProfile]);

  // Server Push Synchronization
  const triggerSync = useCallback(async () => {
    if (!currentUser || !isOnline) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          tasks,
          profile: userProfile,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastSyncedAt(data.syncedAt || new Date().toISOString());
      }
    } catch {
      // Offline fallback: data is already safely stored in localStorage
    } finally {
      setIsSyncing(false);
    }
  }, [currentUser, isOnline, tasks, userProfile]);

  // Server Pull Synchronization (Refreshes data across devices)
  const pullLatestFromServer = useCallback(async () => {
    if (!currentUser || !isOnline) return;
    try {
      const res = await fetch(`/api/sync/tasks/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks)) {
          setTasks((prev) => {
            // Merge tasks: index server tasks
            const map = new Map<string, Task>();
            for (const t of data.tasks) {
              map.set(t.id, t);
            }
            // Keep any local pending tasks that haven't reached server yet
            for (const t of prev) {
              if (!map.has(t.id)) {
                map.set(t.id, t);
              }
            }
            const merged = Array.from(map.values());
            if (currentUser) {
              localStorage.setItem(`taskmaster_tasks_${currentUser.id}`, JSON.stringify(merged));
            }
            return merged;
          });
        }
        if (data.profile) {
          setUserProfile(data.profile);
          const updatedUser: UserAccount = {
            ...currentUser,
            profile: data.profile,
            isProfileCompleted: data.isProfileCompleted ?? currentUser.isProfileCompleted,
          };
          localStorage.setItem('taskmaster_current_user', JSON.stringify(updatedUser));
        }
        if (data.syncedAt) {
          setLastSyncedAt(data.syncedAt);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [currentUser, isOnline]);

  // Two-way manual sync button handler
  const handleManualSyncNow = async () => {
    setIsSyncing(true);
    await triggerSync();
    await pullLatestFromServer();
    setIsSyncing(false);
  };

  // Auto-refresh when user switches back to this tab or window
  useEffect(() => {
    const handleFocus = () => {
      pullLatestFromServer();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [pullLatestFromServer]);

  // Periodic background pull for multi-device collaboration
  useEffect(() => {
    if (!currentUser || !isOnline) return;
    const interval = setInterval(() => {
      pullLatestFromServer();
    }, 30000);
    return () => clearInterval(interval);
  }, [currentUser, isOnline, pullLatestFromServer]);

  // Recalculate status of tasks based on current time
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status === 'completed') return t;
          const status = getTaskStatus(t, now);
          if (status !== t.status) {
            return { ...t, status };
          }
          return t;
        })
      );
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute counts
  const overdueCount = tasks.filter((t) => t.status === 'overdue').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const activeCount = tasks.filter((t) => t.status !== 'completed').length;

  // Handlers
  const handleLoginSuccess = (account: UserAccount, initialTasksList: any[] = []) => {
    setCurrentUser(account);
    setUserProfile(account.profile);
    setSoundEnabled(account.profile.notifications?.soundEnabled ?? true);
    localStorage.setItem('taskmaster_current_user', JSON.stringify(account));

    // Load tasks for this specific account:
    // If server provides tasks (from another device or previous session), use them!
    let loadedTasks: Task[] = [];
    if (Array.isArray(initialTasksList) && initialTasksList.length > 0) {
      loadedTasks = initialTasksList;
    } else {
      try {
        const raw = localStorage.getItem(`taskmaster_tasks_${account.id}`);
        if (raw) {
          loadedTasks = JSON.parse(raw);
        }
      } catch {}
    }

    setTasks(loadedTasks);
    localStorage.setItem(`taskmaster_tasks_${account.id}`, JSON.stringify(loadedTasks));
  };

  const handleProfileOnboardingComplete = (completedProfile: UserProfile) => {
    if (!currentUser) return;
    const updatedAccount: UserAccount = {
      ...currentUser,
      isProfileCompleted: true,
      profile: completedProfile,
      lastSyncedAt: new Date().toISOString(),
    };
    setCurrentUser(updatedAccount);
    setUserProfile(completedProfile);
    setSoundEnabled(completedProfile.notifications?.soundEnabled ?? true);
    localStorage.setItem('taskmaster_current_user', JSON.stringify(updatedAccount));

    // Update local accounts directory
    try {
      const savedAccounts = localStorage.getItem('taskmaster_local_accounts');
      if (savedAccounts) {
        const accounts: UserAccount[] = JSON.parse(savedAccounts);
        const idx = accounts.findIndex((a) => a.id === updatedAccount.id);
        if (idx >= 0) accounts[idx] = updatedAccount;
        else accounts.push(updatedAccount);
        localStorage.setItem('taskmaster_local_accounts', JSON.stringify(accounts));
      }
    } catch {}

    // When entering the software, start with 0 tasks (pristine new workspace)
    setTasks([]);
    localStorage.setItem(`taskmaster_tasks_${updatedAccount.id}`, JSON.stringify([]));

    if (soundEnabled) {
      playNotificationSound('success');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('taskmaster_current_user');
    setCurrentUser(null);
    setTasks([]);
    setActiveTab('overview');
  };

  const handleSaveTask = (savedTask: Task) => {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === savedTask.id);
      const next = exists ? prev.map((t) => (t.id === savedTask.id ? savedTask : t)) : [savedTask, ...prev];
      if (currentUser) {
        localStorage.setItem(`taskmaster_tasks_${currentUser.id}`, JSON.stringify(next));
      }
      return next;
    });

    if (soundEnabled) {
      playNotificationSound('success');
    }

    // Background sync
    triggerSync();
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === updatedTask.id ? updatedTask : t));
      if (currentUser) {
        localStorage.setItem(`taskmaster_tasks_${currentUser.id}`, JSON.stringify(next));
      }
      return next;
    });

    // Background sync
    triggerSync();
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (target) {
      setTaskToDelete(target);
    }
  };

  const handleConfirmDelete = (taskId: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId);
      if (currentUser) {
        localStorage.setItem(`taskmaster_tasks_${currentUser.id}`, JSON.stringify(next));
      }
      return next;
    });
    setTaskToDelete(null);
    triggerSync();
  };

  const handleArchiveTask = (task: Task) => {
    const updated: Task = {
      ...task,
      progress: 100,
      status: 'completed',
      completedAt: new Date().toISOString(),
      subtasks: task.subtasks.map((s) => ({ ...s, completed: true })),
    };
    handleUpdateTask(updated);

    if (soundEnabled) {
      playNotificationSound('success');
    }

    if (userProfile.notifications?.browserEnabled) {
      sendBrowserNotification('Nhiệm vụ hoàn thành!', {
        body: `Nhiệm vụ "${task.title}" đã được nghiệm thu và lưu trữ thành công.`,
      });
    }
  };

  const handleRestoreTask = (task: Task) => {
    const updated: Task = {
      ...task,
      status: 'in_progress',
      completedAt: undefined,
    };
    handleUpdateTask(updated);
  };

  const handleUpdateProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    if (currentUser) {
      const updatedUser: UserAccount = {
        ...currentUser,
        profile: updatedProfile,
      };
      setCurrentUser(updatedUser);
      localStorage.setItem('taskmaster_current_user', JSON.stringify(updatedUser));
      // Trigger background sync to persist updated profile to server
      if (isOnline) {
        fetch('/api/sync/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            tasks,
            profile: updatedProfile,
          }),
        }).catch(() => {});
      }
    }
  };

  const [defaultDueDateForModal, setDefaultDueDateForModal] = useState<string | undefined>(undefined);

  const handleOpenCreateModal = (defaultDueDate?: string | unknown) => {
    setEditingTask(null);
    setDefaultDueDateForModal(typeof defaultDueDate === 'string' ? defaultDueDate : undefined);
    setIsModalOpen(true);
  };

  const handleNavigateToTasks = (filter?: 'all' | 'in_progress' | 'overdue' | 'completed') => {
    if (filter === 'completed') {
      setActiveTab('archive');
    } else {
      setStatusFilter(filter || 'all');
      setActiveTab('tasks');
    }
  };

  const handleToggleSound = () => {
    const newSound = !soundEnabled;
    setSoundEnabled(newSound);
    setUserProfile((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        soundEnabled: newSound,
      },
    }));
  };

  // ----------------------------------------------------
  // ROUTING & AUTH WORKFLOW GATES
  // ----------------------------------------------------

  // Gate 1: No User Logged In -> Show AuthView (Login / Register)
  if (!currentUser) {
    return <AuthView onLoginSuccess={handleLoginSuccess} isOnline={isOnline} />;
  }

  // Gate 2: Logged in but Profile Not Yet Completed -> Show Mandatory Profile Onboarding Modal
  if (!currentUser.isProfileCompleted) {
    return (
      <ProfileOnboardingModal
        user={currentUser}
        onComplete={handleProfileOnboardingComplete}
        isOnline={isOnline}
      />
    );
  }

  // Gate 3: Authenticated & Profile Set -> Access Full Application
  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-['Be_Vietnam_Pro',sans-serif]">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreateModal={handleOpenCreateModal}
        overdueCount={overdueCount}
        completedCount={completedCount}
        activeCount={activeCount}
        userProfile={userProfile}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        isOnline={isOnline}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        onSyncNow={handleManualSyncNow}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'overview' && (
          <DashboardOverview
            tasks={tasks}
            userProfile={userProfile}
            onNavigateToTasks={handleNavigateToTasks}
            onOpenCreateModal={handleOpenCreateModal}
            onNavigateToAiAdvisor={() => setActiveTab('ai-advisor')}
            onQuickCompleteTask={handleArchiveTask}
            onEditTask={handleEditTask}
          />
        )}

        {activeTab === 'tasks' && (
          <ActiveTaskList
            tasks={tasks}
            onUpdateTask={handleUpdateTask}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            onArchiveTask={handleArchiveTask}
            onOpenCreateModal={handleOpenCreateModal}
            units={userProfile.units}
            initialStatusFilter={statusFilter}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveVault
            completedTasks={tasks.filter((t) => t.status === 'completed')}
            userProfile={userProfile}
            onRestoreTask={handleRestoreTask}
            onDeleteTask={handleDeleteTask}
            onOpenCreateModal={handleOpenCreateModal}
          />
        )}

        {activeTab === 'ai-advisor' && (
          <AIAdvisor tasks={tasks} userProfile={userProfile} />
        )}

        {activeTab === 'profile' && (
          <ProfileView profile={userProfile} onUpdateProfile={handleUpdateProfile} />
        )}
      </main>

      {/* Task Creation / Editing Modal */}
      <TaskFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
          setDefaultDueDateForModal(undefined);
        }}
        onSaveTask={handleSaveTask}
        initialTask={editingTask}
        defaultDueDate={defaultDueDateForModal}
        userProfile={userProfile}
      />

      {/* Custom Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={Boolean(taskToDelete)}
        task={taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800">TaskMaster AI</span>
            <span>•</span>
            <span>Hệ Thống Quản Lý &amp; Nhắc Việc Thông Minh</span>
          </div>
          <div className="text-slate-400">
            Tích hợp AI phân rã công việc WBS, đồng bộ ngoại tuyến, điểm số lũy tiến và cố vấn chiến lược.
          </div>
        </div>
      </footer>
    </div>
  );
}
