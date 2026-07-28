"""
Deploy bjj-explorer para VPS nova via nginx estatico.
Uso: python scripts/deploy_vps.py <IP> [--domain <domain>] [--password <senha>]
"""

import sys, os, subprocess, argparse, tempfile
import paramiko
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DIST_DIR     = PROJECT_ROOT / "dist"
REMOTE_DIR   = "/var/www/bjj-explorer"

NGINX_CONF = """\
server {{
    listen 80;
    server_name {server_name};
    root {remote_dir};
    index index.html;
    location / {{ try_files $uri $uri/ /index.html; }}
    location /assets/ {{ expires 1y; add_header Cache-Control "public, immutable"; }}
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}}
"""

def ssh_exec(client, cmd, check=True):
    print(f"    $ {cmd[:80]}")
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    rc  = stdout.channel.recv_exit_status()
    if out: print("   ", out.strip()[:200])
    if err: print("   ", err.strip()[:200])
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return rc

def upload_dir(sftp, local_dir: Path, remote_dir: str):
    """Recursively upload a local directory via SFTP."""
    try:
        sftp.mkdir(remote_dir)
    except OSError:
        pass
    for item in local_dir.iterdir():
        remote_path = remote_dir + "/" + item.name
        if item.is_dir():
            upload_dir(sftp, item, remote_path)
        else:
            sftp.put(str(item), remote_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ip")
    parser.add_argument("--domain",   default=None)
    parser.add_argument("--user",     default="root")
    parser.add_argument("--password", default="B68gHV%ixyXo")
    args = parser.parse_args()

    host   = args.ip
    user   = args.user
    pwd    = args.password
    domain = args.domain or args.ip

    print(f"\n=== Deploy bjj-explorer -> {host} ===\n")

    # 1. Build
    print("[1/5] Building...")
    result = subprocess.run(
        "npm run build", cwd=str(PROJECT_ROOT), shell=True
    )
    if result.returncode != 0:
        print("Build failed!"); sys.exit(1)
    print("      OK\n")

    # Connect SSH
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {host}...")
    client.connect(host, username=user, password=pwd, timeout=30)
    print("Connected.\n")

    # 2. Install nginx
    print("[2/5] Installing nginx...")
    ssh_exec(client, "apt-get update -qq")
    ssh_exec(client, "apt-get install -y nginx")
    print("      OK\n")

    # 3. Upload dist
    print("[3/5] Uploading dist/...")
    ssh_exec(client, f"rm -rf {REMOTE_DIR} && mkdir -p {REMOTE_DIR}")
    sftp = client.open_sftp()
    total = list(DIST_DIR.rglob("*"))
    files = [f for f in total if f.is_file()]
    for i, f in enumerate(files):
        rel = f.relative_to(DIST_DIR)
        remote_path = REMOTE_DIR + "/" + str(rel).replace("\\", "/")
        # ensure parent dir exists
        remote_parent = remote_path.rsplit("/", 1)[0]
        try: sftp.mkdir(remote_parent)
        except OSError: pass
        sftp.put(str(f), remote_path)
        if (i + 1) % 5 == 0 or i == len(files) - 1:
            print(f"      {i+1}/{len(files)} files...")
    sftp.close()
    print("      OK\n")

    # 4. nginx config
    print("[4/5] Configuring nginx...")
    conf = NGINX_CONF.format(server_name=domain, remote_dir=REMOTE_DIR)
    # write via echo
    conf_escaped = conf.replace("'", "'\"'\"'")
    ssh_exec(client,
        f"cat > /etc/nginx/sites-available/bjj-explorer << 'NGINXEOF'\n{conf}\nNGINXEOF")
    ssh_exec(client,
        "ln -sf /etc/nginx/sites-available/bjj-explorer "
        "/etc/nginx/sites-enabled/bjj-explorer")
    ssh_exec(client, "rm -f /etc/nginx/sites-enabled/default")
    ssh_exec(client, "nginx -t")
    ssh_exec(client, "systemctl reload nginx")
    print("      OK\n")

    # 5. Enable on boot
    print("[5/5] Enabling nginx on boot...")
    ssh_exec(client, "systemctl enable nginx")
    print("      OK\n")

    client.close()
    print(f"Deploy concluido! Acesse: http://{domain}\n")

if __name__ == "__main__":
    main()
