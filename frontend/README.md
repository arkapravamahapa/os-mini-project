# 🖥️ System Explorer (OS Mini-Project)
**Cross-Platform Real-Time Process, Thread & Resource Telemetry Utility**

---

## 📌 1. Project Overview (For Report Abstract & Introduction)
**System Explorer** is a cross-platform Operating System utility modeled after Unix `htop`, `top`, and Sysinternals Process Explorer. It provides real-time telemetry of active kernel processes, hardware thread allocations, CPU time deltas, and physical memory (RAM) commitments, alongside direct POSIX/NT process lifecycle management (`SIGTERM`, `SIGSTOP`, `SIGCONT`).

### Key Capabilities Beyond Standard Task Managers:
1. **Live Asynchronous Kernel Telemetry:** Uses persistent bi-directional WebSockets (`ws://`) to stream sub-second OS metrics without UI blocking or HTTP polling overhead.
2. **Process Execution Freezing (`SIGSTOP` / `SIGCONT`):** Allows users to directly **Suspend** (freeze a process in physical memory to free up CPU cycles) and **Resume** execution at will—a feature hidden or absent in standard task managers.
3. **Multi-Core Raw Delta Accounting:** Displays unthrottled per-core thread utilization (where $100\% = 1\text{ Logical Core}$, meaning an 8-core system registers up to $800\%$ total capacity, accurately reflecting `System Idle Process` capacity).
4. **High-Density Algorithmic Grid:** Implements client-side $O(N \log N)$ dynamic sorting across PID, Image Name, Thread Count, CPU %, and Memory %, paired with $O(N)$ real-time substring filtering.

---

## 🏗️ 2. System Architecture & Tech Stack (For Chapter 4: System Design)

### Architectural Layers
```text
+-----------------------------------------------------------------------+
|                    OPERATING SYSTEM KERNEL LAYER                      |
|   Linux: /proc/[pid]/stat, /proc/meminfo, POSIX Signals (kill)        |
|   Windows: NT Kernel System Calls, WMI, Win32 API (OpenProcess)       |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ System Calls via C-Extensions
                                   ▼
+-----------------------------------------------------------------------+
|                 BACKEND TELEMETRY ENGINE (Python / FastAPI)           |
|   - psutil Cross-Platform Abstraction Layer                           |
|   - Asynchronous WebSocket Broadcaster (1 Hz Telemetry Loop)          |
|   - REST Signal Dispatcher (/kill, /suspend, /resume)                 |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ JSON Stream (ws://127.0.0.1:8000)
                                   ▼
+-----------------------------------------------------------------------+
|               HIGH-DENSITY CLIENT INTERFACE (React / Vite)            |
|   - Real-Time State Synchronization & Progress Bars                   |
|   - Client-Side O(N log N) Comparator Sorting Engine                  |
|   - Direct Process Lifecycle Action Controls                          |
+-----------------------------------------------------------------------+


