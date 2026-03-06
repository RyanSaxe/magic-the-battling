import argparse
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
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


def _create_cleanup(processes: list[subprocess.Popen], post_cleanup: list[Callable[[], None]]):
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

        for callback in post_cleanup:
            try:
                callback()
            except Exception as exc:
                print(f"Cleanup callback failed: {exc}")
        sys.exit(0)

    return cleanup


def _validated_port(value: int, name: str) -> int:
    if value < 1 or value > 65535:
        msg = f"{name} must be between 1 and 65535, got {value}"
        raise ValueError(msg)
    return value


def _resolve_db_source(project_root: Path, explicit_path: str | None) -> Path:
    if explicit_path:
        return Path(explicit_path).expanduser().resolve()

    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()

    return (project_root / "data" / "mtb.db").resolve()


def _create_temp_db_copy(project_root: Path, explicit_source: str | None) -> tuple[Path, Path]:
    source = _resolve_db_source(project_root, explicit_source)
    if not source.exists():
        msg = f"--db-copy source database not found: {source}"
        raise FileNotFoundError(msg)

    temp_dir = Path(tempfile.mkdtemp(prefix="mtb-dev-db-"))
    temp_db = temp_dir / source.name
    shutil.copy2(source, temp_db)
    return temp_db, source


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run dev servers")
    parser.add_argument("-r", "--reload", action="store_true", help="Enable auto-reload on code changes")
    parser.add_argument("-b", "--build", action="store_true", help="Build frontend and serve from backend only")
    parser.add_argument("--no-compress", action="store_true", help="Disable WS compression (readable JSON in DevTools)")
    parser.add_argument("--backend-port", type=int, default=8000, help="Backend port (default: 8000)")
    parser.add_argument("--frontend-port", type=int, default=3000, help="Frontend dev-server port (default: 3000)")
    parser.add_argument(
        "--db-copy",
        action="store_true",
        help="Run backend against a temporary copy of the current SQLite DB (deleted on exit)",
    )
    parser.add_argument(
        "--db-source",
        default=None,
        help="Source SQLite DB path for --db-copy (default: DATABASE_PATH or ./data/mtb.db)",
    )
    return parser


def _setup_db_copy(
    project_root: Path, db_copy: bool, db_source: str | None, cleanup_callbacks: list[Callable[[], None]]
) -> Path | None:
    if not db_copy:
        return None

    try:
        temp_db_path, source_db_path = _create_temp_db_copy(project_root, db_source)
    except FileNotFoundError as exc:
        print(exc)
        sys.exit(1)

    cleanup_callbacks.append(lambda: shutil.rmtree(temp_db_path.parent, ignore_errors=True))
    print(f"Using temporary DB copy: {temp_db_path}")
    print(f"  source: {source_db_path}\n")
    return temp_db_path


def _start_backend(
    project_root: Path,
    backend_port: int,
    reload_enabled: bool,
    no_compress: bool,
    temp_db_path: Path | None,
) -> subprocess.Popen:
    uvicorn_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "server.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(backend_port),
    ]
    if reload_enabled:
        uvicorn_cmd.append("--reload")

    backend_env = {**os.environ, "MTB_COMPRESS_WS": "0" if no_compress else "1"}
    if temp_db_path is not None:
        backend_env["DATABASE_PATH"] = str(temp_db_path)

    return subprocess.Popen(
        uvicorn_cmd,
        cwd=project_root,
        start_new_session=True,
        env=backend_env,
    )


def _start_frontend(web_dir: Path, frontend_port: int, backend_port: int) -> subprocess.Popen:
    frontend_env = {
        **os.environ,
        "VITE_BACKEND_PORT": str(backend_port),
        "VITE_FRONTEND_PORT": str(frontend_port),
    }
    return subprocess.Popen(
        ["npm", "run", "dev", "--", "--port", str(frontend_port)],
        cwd=web_dir,
        start_new_session=True,
        env=frontend_env,
    )


def _print_startup(build_only: bool, backend_port: int, frontend_port: int) -> None:
    if build_only:
        print(f"Server running at http://localhost:{backend_port}")
    else:
        print("Dev servers starting...")
        print(f"  Backend:  http://localhost:{backend_port}")
        print(f"  Frontend: http://localhost:{frontend_port}")
    print("Press Ctrl+C to stop.\n")


def _wait_for_exit(processes: list[subprocess.Popen], cleanup: Callable[[], None]) -> None:
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


def main():
    parser = _build_parser()
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    web_dir = project_root / "web"
    dist_dir = web_dir / "dist"
    backend_port = _validated_port(args.backend_port, "--backend-port")
    frontend_port = _validated_port(args.frontend_port, "--frontend-port")
    cleanup_callbacks: list[Callable[[], None]] = []
    temp_db_path = _setup_db_copy(project_root, args.db_copy, args.db_source, cleanup_callbacks)

    if args.build:
        _build_frontend(web_dir, dist_dir)

    backend = _start_backend(project_root, backend_port, args.reload, args.no_compress, temp_db_path)
    processes = [backend]

    if not args.build:
        frontend = _start_frontend(web_dir, frontend_port, backend_port)
        processes.append(frontend)

    cleanup = _create_cleanup(processes, cleanup_callbacks)
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    _print_startup(args.build, backend_port, frontend_port)
    _wait_for_exit(processes, cleanup)


if __name__ == "__main__":
    main()
