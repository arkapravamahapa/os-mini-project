from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psutil
import asyncio
import time
import subprocess
import os
import shlex

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store previous disk I/O bytes per PID to calculate real-time MB/s speed
prev_io = {}
prev_time = time.time()

class RunTaskRequest(BaseModel):
    command: str

def get_system_metrics():
    global prev_io, prev_time
    current_time = time.time()
    elapsed = max(current_time - prev_time, 0.1)

    processes = []
    new_io = {}

    for proc in psutil.process_iter([
        'pid', 'name', 'cpu_percent', 'memory_percent', 
        'memory_info', 'status', 'num_threads'
    ]):
        try:
            info = proc.info
            pid = info['pid']

            cpu_pct = info['cpu_percent'] if info['cpu_percent'] is not None else 0.0
            mem_pct = info['memory_percent'] if info['memory_percent'] is not None else 0.0

            # 1. Exact Physical Memory in MB (Resident Set Size)
            mem_info = info.get('memory_info')
            mem_mb = (mem_info.rss / (1024 * 1024)) if mem_info else 0.0

            # 2. Real-time Disk Read/Write Speed in MB/s
            disk_mb_s = 0.0
            try:
                io_counters = proc.io_counters()
                if io_counters:
                    total_bytes = io_counters.read_bytes + io_counters.write_bytes
                    new_io[pid] = total_bytes
                    if pid in prev_io:
                        byte_diff = max(0, total_bytes - prev_io[pid])
                        disk_mb_s = (byte_diff / (1024 * 1024)) / elapsed
            except (psutil.AccessDenied, psutil.NoSuchProcess, AttributeError):
                pass

            processes.append({
                'pid': pid,
                'name': info['name'] or 'Unknown',
                'status': info['status'] or 'running',
                'num_threads': info['num_threads'] or 1,
                'cpu_percent': cpu_pct,
                'memory_percent': mem_pct,
                'memory_mb': round(mem_mb, 1),
                'disk_mb_s': round(disk_mb_s, 2)
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    prev_io = new_io
    prev_time = current_time

    # Sort by CPU % descending by default
    processes = sorted(processes, key=lambda p: p['cpu_percent'], reverse=True)

    vm = psutil.virtual_memory()
    return {
        "cpu_total": psutil.cpu_percent(interval=None),
        "ram_total": vm.percent,
        "ram_used_gb": round(vm.used / (1024**3), 1),
        "ram_total_gb": round(vm.total / (1024**3), 1),
        "total_processes": len(processes),
        "processes": processes[:120]
    }

@app.websocket("/ws/metrics")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = get_system_metrics()
            await websocket.send_json(data)
            await asyncio.sleep(1)
    except Exception as e:
        print(f"Client disconnected: {e}")

@app.post("/kill/{pid}")
def kill_process(pid: int):
    if pid in (0, 4):
        raise HTTPException(status_code=403, detail="Protected OS Kernel Process cannot be terminated.")
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        return {"message": f"Process {pid} terminated successfully"}
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail="Process not found")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail="Access denied. Run backend as Administrator/Root.")

@app.post("/suspend/{pid}")
def suspend_process(pid: int):
    if pid in (0, 4):
        raise HTTPException(status_code=403, detail="Cannot suspend OS Kernel Process.")
    try:
        proc = psutil.Process(pid)
        proc.suspend()
        return {"message": f"Process {pid} suspended"}
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        raise HTTPException(status_code=403, detail="Access denied. Administrator/Root privileges required.")

@app.post("/resume/{pid}")
def resume_process(pid: int):
    try:
        proc = psutil.Process(pid)
        proc.resume()
        return {"message": f"Process {pid} resumed"}
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        raise HTTPException(status_code=403, detail="Access denied. Administrator/Root privileges required.")

@app.post("/efficiency/{pid}")
def toggle_efficiency_mode(pid: int):
    """Lowers process CPU scheduling priority (similar to Windows 11 Efficiency Mode / Linux nice)"""
    if pid in (0, 4):
        raise HTTPException(status_code=403, detail="Cannot alter Kernel Process priority.")
    try:
        proc = psutil.Process(pid)
        if os.name == 'nt':
            proc.nice(psutil.IDLE_PRIORITY_CLASS)
        else:
            proc.nice(19) # Lowest priority on Ubuntu/Linux
        return {"message": f"Process {pid} placed in Eco/Efficiency priority"}
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        raise HTTPException(status_code=403, detail="Access denied. Administrator/Root privileges required.")

@app.post("/run")
def run_new_task(req: RunTaskRequest):
    cmd = req.command.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Command cannot be empty")
    try:
        if os.name == 'nt':
            # Windows: launches apps like notepad, calc, cmd, msedge, etc.
            subprocess.Popen(cmd, shell=True)
        else:
            # Ubuntu/Linux: launches binary non-blocking
            subprocess.Popen(shlex.split(cmd), start_new_session=True)
        return {"message": f"Launched task: {cmd}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to launch '{cmd}': {str(e)}")