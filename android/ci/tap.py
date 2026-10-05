"""Taps the first element on screen whose text or description contains the given words.
Usage: python3 tap.py 'Try with sample data' [last]   (exit 1 when it is not on screen)
With "last", the last match is tapped (a sheet drawn over the page comes last)."""
import html, re, subprocess, sys, time

want = sys.argv[1].lower()
last = len(sys.argv) > 2 and sys.argv[2] == "last"
for attempt in range(6):
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True)
    xml = subprocess.run(["adb", "shell", "cat", "/sdcard/ui.xml"], capture_output=True, text=True).stdout
    nodes = []
    for node in re.findall(r"<node [^>]*>", xml):
        text = html.unescape((re.search(r' text="([^"]*)"', node) or [None, ""])[1]).lower()
        desc = html.unescape((re.search(r' content-desc="([^"]*)"', node) or [None, ""])[1]).lower()
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        if b: nodes.append((text, desc, b))
    # an exact label first (the "P&L" tab, not the "Meesho P&L" title), then any that contains it
    order = list(reversed(nodes)) if last else nodes
    hit = next((n for n in order if want in (n[0], n[1])), None) or next((n for n in order if want in n[0] or want in n[1]), None)
    if hit:
        b = hit[2]
        x, y = (int(b[1]) + int(b[3])) // 2, (int(b[2]) + int(b[4])) // 2
        subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)])
        print(f"tapped '{want}' at {x},{y}")
        sys.exit(0)
    time.sleep(2)
print(f"NOT FOUND: '{want}'")
sys.exit(1)
