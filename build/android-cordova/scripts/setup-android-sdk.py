#!/usr/bin/env python3
"""
Install Android SDK commandline-tools into /workspace/build/android-cordova/tools/android-sdk
and accept licenses non-interactively.

This script is idempotent: re-running it will skip packages already installed.
"""
import os, sys, shutil, subprocess, urllib.request, tarfile, io

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(ROOT, "..", "tools")
SDK_ROOT = os.path.abspath(os.path.join(TOOLS, "android-sdk"))
CMDLINE_ROOT = os.path.join(SDK_ROOT, "cmdline-tools")
LATEST = os.path.join(CMDLINE_ROOT, "latest")
BIN_SDKMANAGER = os.path.join(LATEST, "bin", "sdkmanager")

CMDLINE_URL = (
    "https://dl.google.com/android/repository/"
    "commandlinetools-linux-11076708_latest.zip"
)
PACKAGES = [
    "platform-tools",
    "platforms;android-34",
    "build-tools;34.0.0",
]

def run(cmd, **kw):
    print(f"\n$ {' '.join(cmd)}")
    return subprocess.run(cmd, **kw)

def check(cmd):
    return shutil.which(cmd) is not None

def ensure_cmdline_tools():
    os.makedirs(CMDLINE_ROOT, exist_ok=True)
    if os.path.isdir(LATEST) and os.path.exists(BIN_SDKMANAGER):
        print(f"[sdk] cmdline-tools already present: {LATEST}")
        return
    tmp_zip = os.path.join(TOOLS, "cmdline-tools.zip")
    print(f"[sdk] downloading cmdline-tools from Google...")
    try:
        urllib.request.urlretrieve(CMDLINE_URL, tmp_zip)
    except Exception as e:
        print(f"[sdk] FAILED download: {e}", file=sys.stderr); sys.exit(2)
    import zipfile
    with zipfile.ZipFile(tmp_zip) as z:
        # Zip extracts to a "cmdline-tools" top folder. Rename that to "latest"
        temp_extract = os.path.join(CMDLINE_ROOT, "_tmp_unzip")
        shutil.rmtree(temp_extract, ignore_errors=True)
        z.extractall(CMDLINE_ROOT)
        extracted = os.path.join(CMDLINE_ROOT, "cmdline-tools")
        if os.path.isdir(extracted):
            if os.path.isdir(LATEST):
                shutil.rmtree(LATEST)
            os.rename(extracted, LATEST)
        shutil.rmtree(temp_extract, ignore_errors=True)
    os.remove(tmp_zip)
    # Make sdkmanager executable
    for f in ["sdkmanager", "avdmanager", "apkanalyzer", "lint"]:
        p = os.path.join(LATEST, "bin", f)
        if os.path.exists(p):
            os.chmod(p, 0o755)
    assert os.path.exists(BIN_SDKMANAGER), "sdkmanager binary missing after unzip"

def accept_licenses():
    # Keep piping "y\n" until sdkmanager exits (matches "Review licenses that have not been accepted" flow)
    print("[sdk] accepting SDK licenses non-interactively...")
    y_stream = io.BytesIO(b"y\n" * 200)
    proc = subprocess.Popen(
        [BIN_SDKMANAGER, "--sdk_root=" + SDK_ROOT, "--licenses"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env={**os.environ, "ANDROID_SDK_ROOT": SDK_ROOT, "ANDROID_HOME": SDK_ROOT},
    )
    out, _ = proc.communicate(input=y_stream.read())
    print(out.decode("utf-8", errors="replace"))
    if proc.returncode not in (0,):
        # sdkmanager often returns non-zero even when licenses were accepted on some versions;
        # we rely on filesystem-state check below instead of exit code alone.
        print(f"[sdk] sdkmanager --licenses exited {proc.returncode} (continuing)")
    licenses_dir = os.path.join(SDK_ROOT, "licenses")
    print(f"[sdk] licenses dir: {licenses_dir}  exists={os.path.isdir(licenses_dir)}")
    if os.path.isdir(licenses_dir):
        for n in sorted(os.listdir(licenses_dir)):
            print("  ", n, os.path.getsize(os.path.join(licenses_dir, n)), "bytes")

def install_packages():
    y_stream = io.BytesIO(b"y\n" * 200)
    cmd = [BIN_SDKMANAGER, "--sdk_root=" + SDK_ROOT, "--install", *PACKAGES]
    proc = subprocess.Popen(
        cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env={**os.environ, "ANDROID_SDK_ROOT": SDK_ROOT, "ANDROID_HOME": SDK_ROOT},
    )
    out, _ = proc.communicate(input=y_stream.read())
    print(out.decode("utf-8", errors="replace"))
    # Check expected dirs: check build-tools/34.0.0 platforms/android-34 platform-tools exist
    wanted = [
        os.path.join(SDK_ROOT, "platform-tools"),
        os.path.join(SDK_ROOT, "platforms", "android-34"),
        os.path.join(SDK_ROOT, "build-tools", "34.0.0"),
    ]
    missing = [w for w in wanted if not os.path.isdir(w)]
    if missing:
        print("[sdk] MISSING expected components:", missing, file=sys.stderr)
        sys.exit(3)
    print("[sdk] SDK components ready.")

def export_env():
    print("\n# paste this into your shell:")
    print(f"export ANDROID_SDK_ROOT={SDK_ROOT}")
    print(f"export ANDROID_HOME={SDK_ROOT}")
    print(f"export PATH=\"{os.path.join(SDK_ROOT,'platform-tools')}:{os.path.join(SDK_ROOT,'cmdline-tools','latest','bin')}:$PATH\"")

if __name__ == "__main__":
    os.makedirs(TOOLS, exist_ok=True)
    if not check("java"):
        print("[sdk] java required, not found in PATH", file=sys.stderr); sys.exit(1)
    ensure_cmdline_tools()
    accept_licenses()
    install_packages()
    export_env()
