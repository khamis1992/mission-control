'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: number;
  title: string;
  assignment_id?: number;
  description?: string | null;
  status: string;
  priority: string;
  resolution?: string | null;
  assigned_to?: string | null;
  error_message?: string;
  retry_count?: number;
  recovery_strategy?: string;
  failure_type?: string;
  outcome?: string;
}

interface StrategyCount {
  retry: number;
  rollback: number;
  escalate: number;
  skip: number;
  fallback: number;
}

const RecoveryDashboardPanel: React.FC = () => {
  const [failedTasks, setFailedTasks] = useState<Task[]>([]);
  const [strategies, setStrategies] = useState<StrategyCount>({ retry: 0, rollback: 0, escalate: 0, skip: 0, fallback: 0 });
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    fetchRecoveryData();
  }, []);
  
  const fetchRecoveryData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?status=failed');
      const data = await res.json();
      const tasks = data.tasks || [];
      
      setFailedTasks(tasks);
      
      const counts: StrategyCount = { retry: 0, rollback: 0, escalate: 0, skip: 0, fallback: 0 };
      tasks.forEach((task: Task) => {
        if (task.recovery_strategy) {
          const strategy = task.recovery_strategy as keyof StrategyCount;
          if (counts[strategy] !== undefined) {
            counts[strategy]++;
          }
        }
      });
      setStrategies(counts);
    } catch (error) {
      console.error('Failed to fetch recovery data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRetry = async (taskId: number) => {
    try {
      await fetch(`/api/recovery/${taskId}?strategy=retry`, { method: 'POST' });
      await fetchRecoveryData();
    } catch (error) {
      console.error('Failed to retry task:', error);
    }
  };
  
  const handleRollback = async (taskId: number) => {
    try {
      await fetch(`/api/recovery/${taskId}?strategy=rollback`, { method: 'POST' });
      await fetchRecoveryData();
    } catch (error) {
      console.error('Failed to rollback task:', error);
    }
  };
  
  const handleEscalate = async (taskId: number) => {
    try {
      await fetch(`/api/recovery/${taskId}?strategy=escalate`, { method: 'POST' });
      await fetchRecoveryData();
    } catch (error) {
      console.error('Failed to escalate task:', error);
    }
  };
  
  const handleSkip = async (taskId: number) => {
    try {
      await fetch(`/api/recovery/${taskId}?strategy=skip`, { method: 'POST' });
      await fetchRecoveryData();
    } catch (error) {
      console.error('Failed to skip task:', error);
    }
  };
  
  const formatStrategyCount = (strategy: keyof StrategyCount): number => strategies[strategy];
  
  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Recovery Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">
          Monitor failed tasks and apply recovery strategies
        </p>
      </div>
      
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-800 rounded p-4 text-center border border-gray-700">
          <div className="text-3xl font-bold text-blue-400 mb-2">{formatStrategyCount('retry')}</div>
          <div className="text-sm text-gray-300 uppercase tracking-wider">Retry</div>
          <div className="text-xs text-gray-600 mt-1">Exponential backoff</div>
        </div>
        <div className="bg-gray-800 rounded p-4 text-center border border-gray-700">
          <div className="text-3xl font-bold text-purple-400 mb-2">{formatStrategyCount('rollback')}</div>
          <div className="text-sm text-gray-300 uppercase tracking-wider">Rollback</div>
          <div className="text-xs text-gray-600 mt-1">Restore checkpoint</div>
        </div>
        <div className="bg-gray-800 rounded p-4 text-center border border-gray-700">
          <div className="text-3xl font-bold text-yellow-400 mb-2">{formatStrategyCount('escalate')}</div>
          <div className="text-sm text-gray-300 uppercase tracking-wider">Escalate</div>
          <div className="text-xs text-gray-600 mt-1">Human operator</div>
        </div>
        <div className="bg-gray-800 rounded p-4 text-center border border-gray-700">
          <div className="text-3xl font-bold text-gray-400 mb-2">{formatStrategyCount('skip')}</div>
          <div className="text-sm text-gray-300 uppercase tracking-wider">Skip</div>
          <div className="text-xs text-gray-600 mt-1">Mark as done</div>
        </div>
        <div className="bg-gray-800 rounded p-4 text-center border border-gray-700">
          <div className="text-3xl font-bold text-green-400 mb-2">{formatStrategyCount('fallback')}</div>
          <div className="text-sm text-gray-300 uppercase tracking-wider">Fallback</div>
          <div className="text-xs text-gray-600 mt-1">Delegate task</div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-gray-400 animate-spin mb-4">⏳</div>
          <div className="text-gray-500">Loading failed tasks...</div>
        </div>
      ) : failedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <div className="text-6xl mb-4">🛡️</div>
          <div className="text-xl">No failed tasks</div>
          <div className="text-sm mt-2">All tasks recovered or completed</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-200">
              <tr>
                <th className="p-3 font-medium">Task</th>
                <th className="p-3 font-medium">Failure Type</th>
                <th className="p-3 font-medium">Strategy</th>
                <th className="p-3 font-medium">Attempts</th>
                <th className="p-3 font-medium">Error</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {failedTasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-blue-400">#{task.id}</div>
                    <div className="text-gray-300 text-xs truncate max-w-[200px]">{task.title}</div>
                  </td>
                  <td className="p-3">
                    <span className="bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded text-xs">
                      {task.failure_type || 'unknown'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="bg-purple-900/30 text-purple-400 px-2 py-1 rounded text-xs">
                      {task.recovery_strategy || 'none'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400">
                    {task.retry_count || 0}
                  </td>
                  <td className="p-3 max-w-xs truncate text-gray-500">
                    {task.error_message || '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRetry(task.id)}
                        className="px-2 py-1 text-blue-400 hover:text-blue-300 text-xs"
                        title="Retry with backoff"
                      >
                        🔄 Retry
                      </button>
                      <button
                        onClick={() => handleRollback(task.id)}
                        className="px-2 py-1 text-purple-400 hover:text-purple-300 text-xs"
                        title="Rollback to checkpoint"
                      >
                        ↩️ Rollback
                      </button>
                      <button
                        onClick={() => handleEscalate(task.id)}
                        className="px-2 py-1 text-yellow-400 hover:text-yellow-300 text-xs"
                        title="Escalate to human"
                      >
                        ⚠️ Escalate
                      </button>
                      <button
                        onClick={() => handleSkip(task.id)}
                        className="px-2 py-1 text-gray-400 hover:text-gray-300 text-xs"
                        title="Mark as skipped"
                      >
                        ⏭️ Skip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecoveryDashboardPanel;
