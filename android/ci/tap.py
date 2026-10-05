"""Taps the first element on screen whose text or description contains the given words.
Usage: python3 tap.py 'Try with sample data'   (exit 1 when it is not on screen)"""
import re, subprocess, sys, time

want = sys.argv[1].lower()
for attempt in range(6):
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True)
    xml = subprocess.run(["adb", "shell", "cat", "/sdcard/ui.xml"], capture_output=True, text=True).stdout
    for node in re.findall(r"<node [^>]*>", xml):
        text = (re.search(r' text="([^"]*)"', node) or [None, ""])[1]
        desc = (re.search(r' content-desc="([^"]*)"', node) or [None, ""])[1]
        if want in text.lower() or want in desc.lower():
            b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
            x, y = (int(b[1]) + int(b[3])) // 2, (int(b[2]) + int(b[4])) // 2
            subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)])
            print(f"tapped '{want}' at {x},{y}")
            sys.exit(0)
    time.sleep(2)
print(f"NOT FOUND: '{want}'")
sys.exit(1)
