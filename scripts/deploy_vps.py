"""
Deploy bjj-explorer para VPS nova.
Uso: python scripts/deploy_vps.py <IP> [--domain <domain>]

Exemplos:
  python scripts/deploy_vps.py 1.2.3.4
  python scripts/deploy_vps.py 1.2.3.4 --domain bjj.feitonamontanha.com.br
"""

import sys
import os
import subprocess
import argparse

# ── config ───────────────────────────────────────────────────────────────────

VPS_USER     = "root"
VPS_PASS     = "B68gHV%ixyXo"   # altere se a senha da nova VPS for diferente
REMOTE_DIR   = "/var/www/bjj-explorer"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR     = os.path.join(PROJECT_ROOT, "dist")

NGINX_CONFIG_TEMPLATE = """\
server {{
    listen 80;
    server_name {server_name};

    root {remote_dir};
    index index.html;

    # SPA fallback
    location / {{
        try_files $uri $uri/ /index.html;
    }}

    # Cache assets
    location /assets/ {{
        expires 1y;
        add_header Cache-Control "public, immutable";
    }}

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}}
"""

# ── helpers ───────────────────────────────────────────────────────────────────

def run_ssh(host: str, command: str) -> int:
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "BatchMode=no",
        f"{VPS_USER}@{host}",
        command,
    ]
    result = subprocess.run(cmd, input=f"{VPS_PASS}\n", capture_output=False, text=True)
    return result.returncode


def run_sshpass(host: str, command: str) -> int:
    cmd = [
        "sshpass", "-p", VPS_PASS,
        "ssh", "-o", "StrictHostKeyChecking=no",
        f"{VPS_USER}@{host}",
        command,
    ]
    result = subprocess.run(cmd)
    return result.returncode


def upload_dir(host: str, local: str, remote: str):
    """Upload directory via scp."""
    cmd = [
        "sshpass", "-p", VPS_PASS,
        "scp", "-o", "StrictHostKeyChecking=no",
        "-r", local, f"{VPS_USER}@{host}:{remote}",
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise RuntimeError(f"scp failed: {result.returncode}")


def ssh(host: str, command: str):
    cmd = [
        "sshpass", "-p", VPS_PASS,
        "ssh", "-o", "StrictHostKeyChecking=no",
        f"{VPS_USER}@{host}",
        command,
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise RuntimeError(f"SSH command failed: {command}")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ip", help="IP da nova VPS")
    parser.add_argument("--domain", default=None, help="Domínio (opcional)")
    parser.add_argument("--password", default=VPS_PASS, help="Senha root da VPS")
    args = parser.parse_args()

    host      = args.ip
    domain    = args.domain or args.ip
    password  = args.password

    # override password if passed
    global VPS_PASS
    VPS_PASS = password

    print(f"\n=== Deploy bjj-explorer → {host} ===\n")

    # 1. Build
    print("[1/5] Building...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=PROJECT_ROOT,
        shell=True,
    )
    if result.returncode != 0:
        print("Build failed!"); sys.exit(1)
    print("     OK")

    # 2. Install nginx
    print("[2/5] Installing nginx...")
    ssh(host, "apt-get update -qq && apt-get install -y nginx")
    print("     OK")

    # 3. Upload dist
    print("[3/5] Uploading dist/...")
    ssh(host, f"rm -rf {REMOTE_DIR} && mkdir -p {REMOTE_DIR}")
    upload_dir(host, DIST_DIR + "/.", REMOTE_DIR)
    print("     OK")

    # 4. nginx config
    print("[4/5] Configuring nginx...")
    nginx_conf = NGINX_CONFIG_TEMPLATE.format(
        server_name=domain,
        remote_dir=REMOTE_DIR,
    )
    escaped = nginx_conf.replace("'", "'\\''")
    ssh(host, f"echo '{escaped}' > /etc/nginx/sites-available/bjj-explorer")
    ssh(host, "ln -sf /etc/nginx/sites-available/bjj-explorer /etc/nginx/sites-enabled/bjj-explorer")
    ssh(host, "rm -f /etc/nginx/sites-enabled/default")
    ssh(host, "nginx -t && systemctl reload nginx")
    print("     OK")

    # 5. Enable nginx on boot
    print("[5/5] Enabling nginx on boot...")
    ssh(host, "systemctl enable nginx")
    print("     OK")

    print(f"\n✓ Deploy concluído!")
    print(f"  Acesse: http://{domain}")
    if domain != args.ip:
        print(f"  (Lembre de apontar o DNS de {domain} para {host})")


if __name__ == "__main__":
    main()
