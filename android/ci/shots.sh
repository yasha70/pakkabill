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
# opens a page from the Tools tab of the bottom bar, scrolling the Tools page until its card shows
more() {
  tap "Tools"; sleep 1
  for i in 1 2 3 4 5; do TAP_TRIES=1 python3 android/ci/tap.py "$1" last >> "$R" && return 0; up; sleep 1; done
  echo "NOT FOUND on the Tools page: $1" >> "$R"; return 1
}
# taps a button further down a page, scrolling until it shows
down() { for i in 1 2 3 4 5 6 7 8 9 10; do TAP_TRIES=1 python3 android/ci/tap.py "$@" >> "$R" && return 0; up; sleep 1; done; echo "NOT FOUND: $1" >> "$R"; return 1; }
# in the phone's file picker: Downloads when the file is not in sight; "long" starts choosing several
inpicker() { TAP_TRIES=2 python3 android/ci/tap.py "$@" >> "$R" && return 0; tap "Show roots"; sleep 2; tap "Downloads"; sleep 3; python3 android/ci/tap.py "$@" >> "$R"; }
pick1() { sleep 4; inpicker "$1"; sleep 3; }
pickn() { sleep 4; inpicker "$1" long; sleep 1; shift; for f in "$@"; do tap "$f"; sleep 1; done; tap "Select"; sleep 3; }
# types in the box under a label (a price, a stock) and presses Done
typein() { python3 android/ci/tap.py "$1" last below=${3:-88} >> "$R"; sleep 1; adb shell input text "$2"; adb shell input keyevent 66; sleep 1; }
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
more "Reconcile"; cap 20-rc 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
up; cap 21-rc 1; up; up; up
frames "Reconcile scroll"
tap "Tools"; cap 22-tools 2
more "Upload"; cap 23-data 3
up; cap 24-data 1
more "Product costs"; cap 25-costs 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
up; cap 26-costs 1; up; cap 27-costs 1; up; up; up
frames "Costs scroll"
more "Expenses"; cap 28-exp 3
more "Settings"; cap 29-set 3
up; cap 30-set 1
more "How to use"; cap 31-guide 4
tap "Next"; cap 32-guide 3
more "PakkaBill Pro"; cap 33-plan 8
up; cap 34-plan 1; up; cap 35-plan 1
adb shell input keyevent KEYCODE_BACK; sleep 1

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

echo "== GST bills" >> "$R"
# a sample shop with three bills (paid IGST, unpaid with GST in the price, an estimate)
adb shell am force-stop $PKG
adb push android/ci/bills-sample.json /data/local/tmp/bills.json
adb shell "run-as $PKG sh -c 'mkdir -p files/bills; cat /data/local/tmp/bills.json > files/bills/bills.json'"
adb shell am start -W -n $PKG/.MainActivity; sleep 5
tap "Bills"; cap b01-bills 3
up; cap b02-bills 1; top
tap "Ravi Traders"; cap b03-bill-view 8
up; cap b04-bill-view 1; up; cap b05-bill-view 1
adb shell input keyevent KEYCODE_BACK; sleep 2
tap "Meena Boutique"; cap b06-bill-incl 8
adb shell input keyevent KEYCODE_BACK; sleep 2
tap "+ New bill"; cap b07-editor 3
tap "Cash sale"; adb shell input text "Ravi"; cap b08-buyer 2
tap "Use"; cap b09-buyer-picked 2
# keyboard away (back only hides it while it is open), then down to the first item
adb shell dumpsys input_method | grep -q "mInputShown=true" && adb shell input keyevent KEYCODE_BACK; sleep 1
up; sleep 1
tap "Item name"; adb shell input text "kurti"; cap b10-item 2
tap "Use"; sleep 1
adb shell dumpsys input_method | grep -q "mInputShown=true" && adb shell input keyevent KEYCODE_BACK
cap b11-item-picked 2
tap "Qty"; sleep 1; cap b12-editor 1
tap "Save"; cap b13-saved 8
adb shell input keyevent KEYCODE_BACK; sleep 2
cap b14-bills-after 2
tap "Unpaid"; cap b15-unpaid 2
more "GST summary"; cap b16-gst 3
more "Shop details"; cap b17-shop 3
up; cap b18-shop 1; up; cap b19-shop 1
more "Parties"; cap b20-parties 3
more "Items"; cap b21-items 3
python3 android/ci/tap.py "New bill or Meesho files" | tee -a "$R"; cap b22-add-menu 2
adb shell input keyevent KEYCODE_BACK; sleep 1
adb shell cmd uimode night yes; tap "Bills"; cap b23-bills-dark 5
adb shell cmd uimode night no; sleep 3
alive bills

echo "== tools" >> "$R"
# the files the tools read, in Downloads for the phone's file picker
for f in android/ci/Meesho-labels-sample.pdf android/ci/Meesho-manifest-sample.pdf android/ci/maroon_front.jpg android/ci/maroon_back.jpg android/core/src/test/resources/listing/Blouses-template.xlsx; do
  adb push "$f" "/sdcard/Download/$(basename "$f")" > /dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$(basename "$f")" > /dev/null
done
tap "Tools"; cap t01-tools 3
up; cap t02-tools 1; up; cap t03-tools 1

echo "== labels and packing chart" >> "$R"
tap "Labels"; cap t10-labels 3
tap "Add label PDF and manifest PDF"; pickn "Meesho-labels-sample.pdf" "Meesho-manifest-sample.pdf"
cap t11-labels 12
up; cap t12-labels 1; up; cap t13-labels 1; up; cap t14-labels 1
alive labels

echo "== GSTR-1" >> "$R"
more "GSTR-1 JSON"; cap t20-gstr1 3
up; cap t21-gstr1 1

echo "== low shipping image" >> "$R"
more "Low shipping image"; cap t30-lowship 3
tap "Add your product photo"; pick1 "maroon_front.jpg"
cap t31-lowship 15
up; cap t32-lowship 1; up; cap t33-lowship 1
alive lowship

echo "== Meesho listing" >> "$R"
more "Meesho listing"; cap t40-listing 3
tap "Choose the template file"; pick1 "Blouses-template.xlsx"
cap t41-listing 8
down "Next: Details"; cap t42-listing-details 3
up; cap t43-listing-details 1
down "Next: Sizes"; cap t44-listing-sizes 3
tap "32"; tap "34"; sleep 1
down "Fill empty cells"; cap t45-listing-sizes 3
down "Next: Photos"; cap t46-listing-photos 3
tap "Add photos"; pickn "maroon_front.jpg" "maroon_back.jpg"
cap t47-listing-photos 6
up; cap t48-listing-photos 1
down "Next: Image links"; cap t49-listing-links 3
down "Next: Download"; cap t4a-listing-download 3
alive listing

echo "== Meesho Lens" >> "$R"
more "Meesho Lens"; cap t50-lens 3
tap "Open Meesho and look at competitors"; cap t51-lens-meesho 20
tap "Close"; sleep 2

echo "== Auto listing" >> "$R"
# one product already waiting for Meesho's form, so the PakkaBill panel shows in Meesho's page even
# if typing a price below does not take on the emulator
adb push android/ci/autolist-ext-sample.json /data/local/tmp/ext.json > /dev/null
adb shell "run-as $PKG sh -c 'mkdir -p files/autolist; cat /data/local/tmp/ext.json > files/autolist/ext.json'"
more "Auto listing"; cap t60-autolist 3
up; cap t61-autolist 1
tap "New template from"; sleep 1; tap "Readymade blouse"; sleep 2
top; down "Sizes, prices and stock"; cap t62-template 2
typein "Meesho price" 349 92; typein "Stock" 10 92
tap "Same price and stock for all"; sleep 1; cap t63-template 1
down "Save template"; cap t64-template-saved 3
down "Add product photos"; pick1 "maroon_front.jpg"
cap t65-product 5
up; sleep 1; cap t66-product 1
down "Fill in Meesho"; sleep 3
# not ready to fill (a price did not take): Meesho's supplier panel from the top of the page instead
if ! TAP_TRIES=1 python3 android/ci/tap.py "Meesho · PakkaBill Auto listing" >> "$R"; then top; tap "Open Meesho supplier panel"; fi
cap t67-meesho 25
cap t68-meesho 10
adb logcat -d | grep -iE "CONSOLE|chromium" | grep -iE "pakkabill|meesho|error" | tail -20 >> "$R"
tap "Done"; cap t69-autolist-back 3
alive autolist

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
more "Product costs"; sleep 3
adb shell dumpsys gfxinfo $PKG reset > /dev/null
for i in 1 2 3 4 5 6; do up; sleep 1; done
frames "Release Costs scroll"
tap "Bills"; cap 84-release-bills 3
tap "+ New bill"; cap 85-release-new-bill 3
adb shell input keyevent KEYCODE_BACK; sleep 1; adb shell input keyevent KEYCODE_BACK; sleep 1
tap "P&L"; sleep 1; tap "P&L"; sleep 2
tap "How to use"; cap 82-release-guide 4
tap "हिंदी"; cap 83-release-hindi 5
alive release
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: |PakkaBill P&L" | head -30 >> "$R"
adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "pakkabill|AndroidRuntime|FATAL|rhino|svg|CONSOLE" "$OUT/logcat-full.txt" | tail -300 > "$OUT/logcat.txt"

# A big Meesho account (about 3,500 payment rows over 200 SKUs, made from the website's sample
# shop), read through the phone's file picker, then scrolled and switched like a seller would.
node android/ci/bigshop.js big | tee -a "$R"
adb push big/Meesho-big-payments.csv /sdcard/Download/Meesho-big-payments.csv > /dev/null
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/Meesho-big-payments.csv > /dev/null
bigshop() {
  echo "== big shop: $1" >> "$R"
  # the app before GST billing had the upload + and Costs in the bottom bar
  if [ "$1" = new ]; then more "Upload"; else tap "Upload files"; fi; sleep 2
  # the drop area can be below the screen: scroll until it shows
  for i in 1 2 3 4; do python3 android/ci/tap.py "Drop Meesho files here" >> "$R" && break; up; sleep 1; done
  sleep 5
  cap "$1-1-picker" 1
  if ! python3 android/ci/tap.py "Meesho-big-payments.csv" >> "$R"; then
    tap "Show roots"; sleep 2; tap "Downloads"; sleep 3; tap "Meesho-big-payments.csv"
  fi
  python3 android/ci/wait.py "Real profit" 300 >> "$R"
  sleep 5; cap "$1-2-pl" 1
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  for i in 1 2 3 4 5 6 7 8; do up; sleep 1; done
  frames "$1: P&L scroll"
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  if [ "$1" = new ]; then more "Product costs"; else tap "Costs"; fi; sleep 5
  frames "$1: open Costs"
  cap "$1-3-costs" 1
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  for i in 1 2 3 4 5 6 7 8; do up; sleep 1; done
  frames "$1: Costs scroll"
  cap "$1-4-costs" 1
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  if [ "$1" = new ]; then more "Reconcile"; else tap "Reconcile"; fi; sleep 5
  frames "$1: open Reconcile"
  adb shell dumpsys gfxinfo $PKG reset > /dev/null
  for i in 1 2 3 4 5 6; do up; sleep 1; done
  frames "$1: Reconcile scroll"
  cap "$1-5-rc" 1
  adb logcat -d | grep -E "PakkaBill P&L: report" | tail -2 >> "$R"
}
adb shell pm clear $PKG > /dev/null
adb shell am start -W -n $PKG/.MainActivity > /dev/null; sleep 6
bigshop "new"

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
  adb shell pm clear $PKG > /dev/null
  adb shell am start -W -n $PKG/.MainActivity > /dev/null; sleep 6
  bigshop "old"
fi
exit 0
