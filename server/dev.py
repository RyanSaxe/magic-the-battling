import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Run dev servers")
    parser.add_argument("-r", "--reload", action="store_true", help="Enable auto-reload on code changes")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    web_dir = project_root / "web"

    uvicorn_cmd = [sys.executable, "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
    if args.reload:
        uvicorn_cmd.append("--reload")

    # start_new_session creates process groups so we can cleanly kill child processes
    backend = subprocess.Popen(
        uvicorn_cmd,
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
