import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


def _build_frontend(web_dir: Path, dist_dir: Path) -> None:
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
        print("Cleaned up old build...")

    print("Building frontend...")
    result = subprocess.run(["npm", "run", "build"], cwd=web_dir, check=False)
    if result.returncode != 0:
        print("Frontend build failed!")
        sys.exit(1)
    print("Build complete.\n")


def _create_cleanup(processes: list):
    def cleanup(_signum=None, _frame=None):
        for proc in processes:
            if proc.poll() is None:
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

    return cleanup


def main():
    parser = argparse.ArgumentParser(description="Run dev servers")
    parser.add_argument("-r", "--reload", action="store_true", help="Enable auto-reload on code changes")
    parser.add_argument("-b", "--build", action="store_true", help="Build frontend and serve from backend only")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    web_dir = project_root / "web"
    dist_dir = web_dir / "dist"

    if args.build:
        _build_frontend(web_dir, dist_dir)

    uvicorn_cmd = [sys.executable, "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
    if args.reload:
        uvicorn_cmd.append("--reload")

    # start_new_session creates process groups so we can cleanly kill child processes
    backend = subprocess.Popen(
        uvicorn_cmd,
        cwd=project_root,
        start_new_session=True,
    )

    processes = [backend]

    if not args.build:
        frontend = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=web_dir,
            start_new_session=True,
        )
        processes.append(frontend)

    cleanup = _create_cleanup(processes)
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    if args.build:
        print("Server running at http://localhost:8000")
    else:
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
