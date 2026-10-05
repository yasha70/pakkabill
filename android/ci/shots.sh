#!/usr/bin/env bash
# Runs on the emulator in GitHub Actions: installs the debug app, drives the native screens and
# saves screenshots and test results into shots/.
set -x
OUT=shots
mkdir -p "$OUT"
R="$OUT/results.txt"
APK=$(ls apk/*.apk | head -1)
PKG=com.pakkabill.app
adb install -r "$APK" || exit 1
adb shell settings put system screen_off_timeout 1800000
adb shell svc power stayon true
adb logcat -c
cap() { sleep "$2"; adb exec-out screencap -p > "$OUT/$1.png"; }
tap() { python3 android/ci/tap.py "$1" | tee -a "$R"; }
swipe_up() { adb shell input swipe 540 1900 540 600 400; }
check_alive() { echo "$1 running: $(adb shell pidof $PKG | tr -d '\r')" >> "$R"; }

adb shell am start -W -n $PKG/.MainActivity
cap 01-start 8
check_alive "start"

echo "== sample data" >> "$R"
tap "Try with sample data"
cap 02-sample-pnl 25
adb logcat -d | grep -E "PakkaBill P&L" | tail -5 >> "$R"
swipe_up; cap 03-pnl-scroll 2
swipe_up; cap 04-pnl-scroll2 2
swipe_up; swipe_up; cap 05-pnl-scroll3 2

echo "== tabs" >> "$R"
tap "Costs"; cap 06-costs 3
tap "MN08"; cap 07-cost-dialog 3
adb shell input keyevent KEYCODE_BACK; sleep 1
tap "Files"; cap 08-files 3
tap "Account"; cap 09-account 3
tap "P&L settings and expenses"; cap 10-pnl-settings 3
adb shell input keyevent KEYCODE_BACK; sleep 1

echo "== downloads need login" >> "$R"
tap "P&L"; sleep 2
adb shell input swipe 540 600 540 1900 300; sleep 1
tap "Excel"; cap 11-login-asked 3
adb shell input keyevent KEYCODE_BACK; sleep 1

echo "== own files: Excel payment report and orders CSV, read on the phone" >> "$R"
adb push android/core/src/test/resources/meesho/pay.xlsx /data/local/tmp/pay.xlsx
adb push android/core/src/test/resources/meesho/orders.csv /data/local/tmp/orders.csv
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/pay.xlsx > files/Meesho-payments.xlsx; cat /data/local/tmp/orders.csv > files/Orders.csv'"
adb shell am start -W -a android.intent.action.VIEW -d "file:///data/data/$PKG/files/Meesho-payments.xlsx" -n $PKG/.MainActivity
cap 12-adding-file 3
cap 13-own-file-pnl 20
adb shell am start -W -a android.intent.action.VIEW -d "file:///data/data/$PKG/files/Orders.csv" -n $PKG/.MainActivity
cap 14-two-files 20
tap "Files"; cap 15-files-list 3
tap "Costs"; cap 16-costs-missing 3
tap "P&L"; sleep 1

echo "== dark mode" >> "$R"
adb shell cmd uimode night yes
cap 17-dark 6
adb shell cmd uimode night no
sleep 3

echo "== restart: last report shows at once" >> "$R"
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
cap 18-reopen 3
check_alive "debug"
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime" | head -20 >> "$R"

echo "== release build (minified) smoke test" >> "$R"
adb logcat -d > "$OUT/logcat-debug.txt"
adb uninstall $PKG
adb logcat -c
adb install -r rel/PakkaBill-release-test.apk 2>&1 | tee -a "$R"
adb shell am start -W -n $PKG/.MainActivity
cap 20-release-start 8
tap "Try with sample data"
cap 21-release-sample 30
swipe_up; cap 22-release-scroll 2
check_alive "release"
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime|PakkaBill P&L" | head -30 >> "$R"
adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "pakkabill|AndroidRuntime|FATAL|rhino" "$OUT/logcat-full.txt" | tail -300 > "$OUT/logcat.txt"
exit 0
