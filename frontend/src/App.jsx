import { useEffect, useState } from 'react';

function App() {
  const [metrics, setMetrics] = useState({
    cpu_total: 0,
    ram_total: 0,
    ram_used_gb: 0,
    ram_total_gb: 0,
    total_processes: 0,
    processes: []
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'cpu_percent', direction: 'desc' });
  const [hideIdle, setHideIdle] = useState(true); // Toggle to hide PID 0 (System Idle Process)
  
  // "Run New Task" Modal State
  const [showRunModal, setShowRunModal] = useState(false);
  const [taskCommand, setTaskCommand] = useState('');
  const [statusBanner, setStatusBanner] = useState(null);

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/metrics");
    ws.onmessage = (event) => setMetrics(JSON.parse(event.data));
    return () => ws.close();
  }, []);

  const showToast = (msg, isError = false) => {
    setStatusBanner({ msg, isError });
    setTimeout(() => setStatusBanner(null), 3500);
  };

  const handleProcessAction = async (pid, name, action) => {
    if (action === 'kill' && !window.confirm(`[SYSTEM WARNING] Terminate ${name} (PID: ${pid})?`)) return;

    try {
      const response = await fetch(`http://127.0.0.1:8000/${action}/${pid}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.detail || 'Access Denied', true);
      } else {
        showToast(data.message, false);
      }
    } catch {
      showToast("Error communicating with kernel backend.", true);
    }
  };

  const handleRunNewTask = async (e) => {
    e.preventDefault();
    if (!taskCommand.trim()) return;
    try {
      const response = await fetch(`http://127.0.0.1:8000/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: taskCommand })
      });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.detail || 'Failed to spawn process', true);
      } else {
        showToast(`Spawned new task: ${taskCommand}`, false);
        setTaskCommand('');
        setShowRunModal(false);
      }
    } catch {
      showToast("Error connecting to backend.", true);
    }
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Windows 11 Task Manager Style Crimson Heatmap Generator
  const getHeatmapStyle = (value, maxScale) => {
    const ratio = Math.min(Math.max(value / maxScale, 0), 1);
    const alpha = 0.08 + ratio * 0.55; // Higher resource usage = deeper crimson glow
    return {
      backgroundColor: `rgba(195, 45, 55, ${alpha.toFixed(2)})`
    };
  };

  // Filter & Sort Pipeline
  let processedData = metrics.processes.filter(proc => {
    if (hideIdle && proc.pid === 0) return false;
    return (
      proc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(proc.pid).includes(searchTerm)
    );
  });

  processedData.sort((a, b) => {
    const valA = a[sortConfig.key];
    const valB = b[sortConfig.key];
    if (typeof valA === 'string') {
      return sortConfig.direction === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Calculate total Disk I/O across visible processes
  const totalDiskMBs = processedData.reduce((acc, p) => acc + (p.disk_mb_s || 0), 0);

  return (
    <div className="min-h-screen bg-[#181818] text-[#e0e0e0] font-sans selection:bg-red-900 text-xs select-none">
      
      {/* Top Windows 11-Inspired Command Bar */}
      <header className="bg-[#202020] border-b border-[#323232] px-4 py-2.5 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#e81123] animate-pulse"></div>
          <h1 className="text-base font-semibold text-white tracking-wide"> System Explorer</h1>
          <span className="text-[11px] px-2 py-0.5 bg-[#2d2d2d] text-gray-300 border border-[#404040] rounded">
            Active Processes ({metrics.total_processes})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Hide System Idle Toggle */}
          <button
            onClick={() => setHideIdle(!hideIdle)}
            className={`px-2.5 py-1 rounded border text-xs transition-colors ${
              hideIdle 
                ? 'bg-[#2b2b2b] border-[#454545] text-gray-300 hover:bg-[#353535]' 
                : 'bg-[#0078d4] border-[#0078d4] text-white'
            }`}
            title="Toggle visibility of PID 0 (System Idle Process)"
          >
            {hideIdle ? 'Show System Idle (PID 0)' : 'Showing Raw Kernel Idle'}
          </button>

          {/* + Run New Task Button */}
          <button
            onClick={() => setShowRunModal(true)}
            className="flex items-center gap-1.5 bg-[#2d2d2d] hover:bg-[#3a3a3a] text-white border border-[#454545] px-3 py-1 rounded transition-colors font-medium"
          >
            <span>➕</span> Run new task
          </button>

          {/* Search Filter */}
          <input
            type="text"
            placeholder="Filter by name or PID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#141414] border border-[#3a3a3a] text-white px-3 py-1 rounded focus:outline-none focus:border-[#c32d37] w-56"
          />
        </div>
      </header>

      {/* Status Toast Notification */}
      {statusBanner && (
        <div className={`px-4 py-2 text-xs font-medium flex justify-between items-center ${
          statusBanner.isError ? 'bg-[#5a1d1d] text-red-200 border-b border-red-800' : 'bg-[#1e4620] text-green-200 border-b border-green-800'
        }`}>
          <span>{statusBanner.isError ? '⚠️ ' : '✔ '} {statusBanner.msg}</span>
          <button onClick={() => setStatusBanner(null)} className="text-white/70 hover:text-white">✕</button>
        </div>
      )}

      {/* Hardware Summary Telemetry Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-[#181818]">
        <div className="bg-[#202020] border border-[#303030] p-3 rounded flex flex-col gap-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-gray-400 uppercase font-semibold tracking-wider">CPU Utilization</span>
            <span className="text-lg font-bold text-white">{metrics.cpu_total.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-[#121212] h-1.5 rounded overflow-hidden">
            <div className="bg-[#c32d37] h-full transition-all duration-300" style={{ width: `${Math.min(metrics.cpu_total, 100)}%` }}></div>
          </div>
        </div>

        <div className="bg-[#202020] border border-[#303030] p-3 rounded flex flex-col gap-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-gray-400 uppercase font-semibold tracking-wider">
              Memory ({metrics.ram_used_gb} / {metrics.ram_total_gb} GB)
            </span>
            <span className="text-lg font-bold text-white">{metrics.ram_total.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-[#121212] h-1.5 rounded overflow-hidden">
            <div className="bg-[#c32d37] h-full transition-all duration-300" style={{ width: `${Math.min(metrics.ram_total, 100)}%` }}></div>
          </div>
        </div>

        <div className="bg-[#202020] border border-[#303030] p-3 rounded flex flex-col gap-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-gray-400 uppercase font-semibold tracking-wider">Active Disk I/O Throughput</span>
            <span className="text-lg font-bold text-white">{totalDiskMBs.toFixed(2)} MB/s</span>
          </div>
          <div className="w-full bg-[#121212] h-1.5 rounded overflow-hidden">
            <div className="bg-[#c32d37] h-full transition-all duration-300" style={{ width: `${Math.min(totalDiskMBs * 5, 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* Windows 11 Heatmap Process Table */}
      <div className="px-3 pb-3">
        <div className="bg-[#202020] border border-[#303030] rounded overflow-hidden shadow-xl">
          <div className="h-[calc(100vh-185px)] overflow-y-auto overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#252525] sticky top-0 border-b border-[#383838] text-[11px] text-gray-300 z-10">
                <tr>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232]" onClick={() => handleSort('name')}>
                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232] w-20 text-right" onClick={() => handleSort('pid')}>
                    PID {sortConfig.key === 'pid' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-2.5 font-semibold border-r border-[#323232] w-24 text-center">
                    Status
                  </th>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232] w-20 text-right" onClick={() => handleSort('num_threads')}>
                    Threads {sortConfig.key === 'num_threads' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232] w-28 text-right" onClick={() => handleSort('cpu_percent')}>
                    <div className="text-white text-sm font-bold">{metrics.cpu_total.toFixed(0)}%</div>
                    <div className="text-[10px] text-gray-400">CPU {sortConfig.key === 'cpu_percent' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</div>
                  </th>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232] w-36 text-right" onClick={() => handleSort('memory_mb')}>
                    <div className="text-white text-sm font-bold">{metrics.ram_total.toFixed(0)}%</div>
                    <div className="text-[10px] text-gray-400">Memory {sortConfig.key === 'memory_mb' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</div>
                  </th>
                  <th className="p-2.5 font-semibold cursor-pointer hover:bg-[#323232] border-r border-[#323232] w-28 text-right" onClick={() => handleSort('disk_mb_s')}>
                    <div className="text-white text-sm font-bold">{totalDiskMBs.toFixed(1)} MB/s</div>
                    <div className="text-[10px] text-gray-400">Disk {sortConfig.key === 'disk_mb_s' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</div>
                  </th>
                  <th className="p-2.5 font-semibold text-center w-60">
                    Kernel Lifecycle Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {processedData.map((proc) => (
                  <tr key={proc.pid} className="hover:bg-[#2c2c2c] transition-none">
                    
                    {/* Process Name */}
                    <td className="p-2 border-r border-[#2c2c2c] font-medium text-white truncate max-w-[220px]">
                      {proc.name}
                    </td>

                    {/* PID */}
                    <td className="p-2 border-r border-[#2c2c2c] font-mono text-gray-400 text-right">
                      {proc.pid}
                    </td>

                    {/* Status Badge */}
                    <td className="p-2 border-r border-[#2c2c2c] text-center">
                      {proc.status.toLowerCase() === 'stopped' ? (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Suspended
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-400">
                          {proc.status}
                        </span>
                      )}
                    </td>

                    {/* Threads */}
                    <td className="p-2 border-r border-[#2c2c2c] font-mono text-gray-300 text-right">
                      {proc.num_threads}
                    </td>

                    {/* CPU % Heatmap Cell */}
                    <td 
                      style={getHeatmapStyle(proc.cpu_percent, 40)} 
                      className="p-2 border-r border-[#181818] font-mono text-right text-white"
                    >
                      {(proc.cpu_percent || 0).toFixed(1)}%
                    </td>

                    {/* Memory MB + % Heatmap Cell */}
                    <td 
                      style={getHeatmapStyle(proc.memory_mb, 800)} 
                      className="p-2 border-r border-[#181818] font-mono text-right text-white"
                    >
                      {(proc.memory_mb || 0).toFixed(1)} MB
                      <span className="text-[10px] text-gray-300 ml-1">
                        ({(proc.memory_percent || 0).toFixed(1)}%)
                      </span>
                    </td>

                    {/* Disk MB/s Heatmap Cell */}
                    <td 
                      style={getHeatmapStyle(proc.disk_mb_s, 10)} 
                      className="p-2 border-r border-[#181818] font-mono text-right text-white"
                    >
                      {(proc.disk_mb_s || 0).toFixed(1)} MB/s
                    </td>

                    {/* Action Controls */}
                    <td className="p-1.5 flex gap-1 justify-center items-center">
                      <button
                        onClick={() => handleProcessAction(proc.pid, proc.name, 'efficiency')}
                        className="px-2 py-1 bg-[#2b2b2b] hover:bg-emerald-700 text-emerald-400 hover:text-white rounded border border-[#3e3e3e] transition-colors text-[11px]"
                        title="Enable Efficiency Mode (Lower CPU Scheduling Priority)"
                      >
                        🍃 Eco
                      </button>
                      <button
                        onClick={() => handleProcessAction(proc.pid, proc.name, 'suspend')}
                        className="px-2 py-1 bg-[#2b2b2b] hover:bg-amber-600 text-gray-200 hover:text-black rounded border border-[#3e3e3e] transition-colors text-[11px]"
                        title="Suspend Process (SIGSTOP)"
                      >
                        Suspend
                      </button>
                      <button
                        onClick={() => handleProcessAction(proc.pid, proc.name, 'resume')}
                        className="px-2 py-1 bg-[#2b2b2b] hover:bg-blue-600 text-gray-200 hover:text-white rounded border border-[#3e3e3e] transition-colors text-[11px]"
                        title="Resume Process (SIGCONT)"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => handleProcessAction(proc.pid, proc.name, 'kill')}
                        className="px-2 py-1 bg-[#3a1d1d] hover:bg-[#e81123] text-red-300 hover:text-white rounded border border-red-900/60 transition-colors text-[11px]"
                        title="End Task (SIGTERM)"
                      >
                        End task
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* "Run New Task" Modal (Just like Windows Task Manager) */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#252525] border border-[#454545] rounded-lg w-full max-w-md p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-1">Create new task</h2>
            <p className="text-xs text-gray-400 mb-4">
              Type the name of a program (e.g., <code className="text-amber-300">notepad</code>, <code className="text-amber-300">calc</code>, <code className="text-amber-300">cmd</code>) and the OS Kernel will spawn it.
            </p>
            <form onSubmit={handleRunNewTask} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Open: notepad"
                value={taskCommand}
                onChange={(e) => setTaskCommand(e.target.value)}
                className="w-full bg-[#141414] border border-[#505050] text-white px-3 py-2 rounded focus:outline-none focus:border-[#0078d4]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  className="px-4 py-1.5 bg-[#333333] hover:bg-[#404040] text-gray-200 rounded border border-[#505050]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0078d4] hover:bg-[#1084df] text-white font-medium rounded"
                >
                  OK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;