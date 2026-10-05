"""Waits until some text is on screen. Usage: python3 wait.py 'Real profit' 180   (exit 1 on timeout)"""
import html, re, subprocess, sys, time

want = sys.argv[1].lower()
end = time.time() + (int(sys.argv[2]) if len(sys.argv) > 2 else 60)
start = time.time()
while time.time() < end:
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True)
    xml = html.unescape(subprocess.run(["adb", "shell", "cat", "/sdcard/ui.xml"], capture_output=True, text=True).stdout).lower()
    if want in xml:
        print(f"'{want}' on screen after {round(time.time() - start)} s")
        sys.exit(0)
    time.sleep(3)
print(f"NOT ON SCREEN after {round(time.time() - start)} s: '{want}'")
sys.exit(1)
