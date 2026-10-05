#!/usr/bin/env bash
# Runs on the emulator in GitHub Actions: installs the debug app, drives the native screens (the
# same tabs as the website's Meesho P&L) and saves screenshots and test results into shots/.
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
tap() { python3 android/ci/tap.py "$1" $2 | tee -a "$R"; }
# opens a page from the More sheet of the bottom bar
more() { tap "More"; sleep 1; tap "$1" last; }
# frames drawn, janky frames and where the time went (app thread or drawing), since the last reset
frames() { echo "$1: $(adb shell dumpsys gfxinfo ${2:-$PKG} | grep -E 'Total frames rendered|Janky frames:|50th percentile|90th percentile|Number Slow UI thread|Number Slow issue draw|Number Frame deadline missed|50th gpu|90th gpu' | tr -d '\r' | tr -s ' ' | tr '\n' ';')" >> "$R"; }
up() { adb shell input swipe 540 1900 540 500 350; }
top() { for i in 1 2 3 4 5 6; do adb shell input swipe 540 500 540 1900 120; done; }
alive() { echo "$1 running: $(adb shell pidof $PKG | tr -d '\r')" >> "$R"; }

echo "== this emulator, for comparison: the phone's own Settings app" >> "$R"
adb shell am start -W -a android.settings.SETTINGS > /dev/null; sleep 4
adb shell dumpsys gfxinfo com.android.settings reset > /dev/null
for i in 1 2 3 4 5 6; do up; sleep 1; done
frames "Settings app scroll" com.android.settings
adb shell input keyevent KEYCODE_HOME; sleep 1

adb shell am start -W -n $PKG/.MainActivity
cap 01-start 8
alive start

echo "== sample data" >> "$R"
tap "Try with sample data"
cap 02-pl 20
adb logcat -d | grep -E "PakkaBill P&L" | tail -3 >> "$R"
adb shell dumpsys gfxinfo $PKG reset > /dev/null
for n in 03 04 05 06 07 08 09 10; do up; cap pl-$n 1; done
up; cap 11-pl 1; up; cap 12-pl 1; up; cap 13-pl 1
frames "P&L scroll"

echo "== tabs" >> "$R"
top
tap "Reconcile"; cap 20-rc 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
up; cap 21-rc 1; up; up; up
frames "Reconcile scroll"
tap "More"; cap 22-more 2
tap "Upload" last; cap 23-data 3
up; cap 24-data 1
tap "Costs"; cap 25-costs 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
up; cap 26-costs 1; up; cap 27-costs 1; up; up; up
frames "Costs scroll"
more "Expenses"; cap 28-exp 3
more "Settings"; cap 29-set 3
up; cap 30-set 1
more "How to use"; cap 31-guide 4
tap "Next"; cap 32-guide 3

echo "== Hindi" >> "$R"
tap "P&L"; sleep 1; top
tap "हिंदी"; cap 40-hi-pl 6
up; cap 41-hi-pl 1; up; cap 42-hi-pl 1
top; tap "EN"; sleep 2

echo "== downloads need login" >> "$R"
tap "Download Excel"; cap 43-login-asked 4
adb shell input keyevent KEYCODE_BACK; sleep 1

echo "== account" >> "$R"
tap "Log in"; cap 44-account 3
adb shell input keyevent KEYCODE_BACK; sleep 1

echo "== own files" >> "$R"
adb push android/core/src/test/resources/meesho/pay.xlsx /data/local/tmp/pay.xlsx
adb push android/core/src/test/resources/meesho/orders.csv /data/local/tmp/orders.csv
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/pay.xlsx > files/Meesho-payments.xlsx; cat /data/local/tmp/orders.csv > files/Orders.csv'"
adb shell am start -W -a android.intent.action.VIEW -d "file:///data/data/$PKG/files/Meesho-payments.xlsx" -n $PKG/.MainActivity
cap 50-own-file 15
adb shell am start -W -a android.intent.action.VIEW -d "file:///data/data/$PKG/files/Orders.csv" -n $PKG/.MainActivity
cap 51-two-files 15
up; cap 52-own-pl 1
more "Upload"; cap 53-files 3; up; cap 54-files 1

echo "== dark mode" >> "$R"
top; tap "P&L"; adb shell cmd uimode night yes
cap 60-dark 6
up; cap 61-dark 1
adb shell cmd uimode night no
sleep 3
tap "Dark"; cap 62-dark-button 3
tap "Light"; sleep 2

echo "== restart" >> "$R"
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
cap 70-reopen 4
alive debug
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: " | head -30 >> "$R"

echo "== release build (minified) smoke test" >> "$R"
adb logcat -d > "$OUT/logcat-debug.txt"
adb uninstall $PKG
adb logcat -c
adb install -r rel/PakkaBill-release-test.apk 2>&1 | tee -a "$R"
adb shell am start -W -n $PKG/.MainActivity
cap 80-release-start 8
tap "Try with sample data"
cap 81-release-sample 25
adb shell dumpsys gfxinfo $PKG reset > /dev/null
for i in 1 2 3 4 5 6 7 8; do up; sleep 1; done
frames "Release P&L scroll"
tap "Costs"; sleep 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
for i in 1 2 3 4 5 6; do up; sleep 1; done
frames "Release Costs scroll"
tap "P&L"; sleep 1; tap "P&L"; sleep 2
tap "How to use"; cap 82-release-guide 4
tap "हिंदी"; cap 83-release-hindi 5
alive release
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: |PakkaBill P&L" | head -30 >> "$R"
adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "pakkabill|AndroidRuntime|FATAL|rhino|svg" "$OUT/logcat-full.txt" | tail -300 > "$OUT/logcat.txt"

# the same scrolling with the app the website offers now, when it is older than this one
OLD=$(grep -o '"versionCode": *[0-9]*' download/app.json | grep -o '[0-9]*$')
NEW=$(grep -o 'versionCode = [0-9]*' android/app/build.gradle.kts | grep -o '[0-9]*$')
if [ -n "$OLD" ] && [ -n "$NEW" ] && [ "$OLD" -lt "$NEW" ]; then
  echo "== the website's app (versionCode $OLD) for comparison" >> "$R"
  adb uninstall $PKG
  adb install -r download/PakkaBill.apk 2>&1 | tail -1 >> "$R"
  adb shell am start -W -n $PKG/.MainActivity; sleep 8
  tap "Try with sample data"; sleep 25
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  for i in 1 2 3 4 5 6 7 8; do up; sleep 1; done
  frames "Old app P&L scroll"
  tap "Costs"; sleep 3
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  for i in 1 2 3 4 5 6; do up; sleep 1; done
  frames "Old app Costs scroll"
  cap 90-old-costs 1
fi
exit 0
