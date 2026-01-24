import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def main():
    project_root = Path(__file__).parent.parent
    web_dir = project_root / "web"

    # Create processes in their own process groups so we can kill them cleanly
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=project_root,
        start_new_session=True,
    )

    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=web_dir,
        start_new_session=True,
    )

    processes = [backend, frontend]

    def cleanup(_signum=None, _frame=None):
        for proc in processes:
            if proc.poll() is None:
                # Kill the entire process group
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except (ProcessLookupError, OSError):
                    pass
        for proc in processes:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print("Dev servers starting...")
    print("  Backend:  http://localhost:8000")
    print("  Frontend: http://localhost:3000")
    print("Press Ctrl+C to stop.\n")

    # Wait for either process to exit
    try:
        while True:
            for proc in processes:
                ret = proc.poll()
                if ret is not None:
                    print(f"Process exited with code {ret}, shutting down...")
                    cleanup()
            time.sleep(0.5)
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
