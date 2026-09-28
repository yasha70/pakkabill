#!/usr/bin/env bash
# Runs on the emulator in GitHub Actions: installs the debug app, drives it and saves screenshots
# and test results into shots/.
set -x
OUT=shots
mkdir -p "$OUT"
APK=$(ls apk/*.apk | head -1)
adb install -r "$APK" || exit 1
adb shell settings put system screen_off_timeout 1800000
adb shell svc power stayon true
adb logcat -c
cap() { sleep "$2"; adb exec-out screencap -p > "$OUT/$1.png"; }
js() { python3 android/ci/cdp.py "$1" | tee -a "$OUT/results.txt"; }
open_url() { adb shell am start -W -a android.intent.action.VIEW -d "$1" com.pakkabill.app; }

adb shell am start -W -n com.pakkabill.app/.MainActivity
cap 01-start 35
PID=$(adb shell pidof com.pakkabill.app | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
sleep 2
echo "== bridge" >> "$OUT/results.txt"
js 'JSON.stringify({app: typeof window.PakkaBillApp, version: window.PakkaBillApp && PakkaBillApp.version, ua: /PakkaBillApp/.test(navigator.userAgent), print: String(window.print).includes("send"), share: typeof navigator.share, hash: location.hash})'

open_url "https://pakkabill1.vercel.app/#/new"
cap 02-new-bill 10
open_url "https://pakkabill1.vercel.app/#/account"
cap 03-account 10

echo "== download all my data" >> "$OUT/results.txt"
js '(function(){var b=document.querySelector("[data-pba=download]"); if(!b) return "no button"; b.click(); return "clicked";})()'
cap 04-saved-snackbar 5
adb shell ls -la /sdcard/Download/PakkaBill/ 2>&1 | tee -a "$OUT/results.txt"

echo "== share a PDF" >> "$OUT/results.txt"
js 'navigator.share({title:"Bill", text:"Your bill", files:[new File(["%PDF-1.4 test"], "Bill-1.pdf", {type:"application/pdf"})]}).then(function(){return "shared"})'
cap 05-share-sheet 5
adb shell input keyevent KEYCODE_BACK
sleep 2

echo "== confirm dialog" >> "$OUT/results.txt"
js 'setTimeout(function(){ window.__c = confirm("Delete this bill?"); }, 300); "asked"'
cap 06-confirm-dialog 3
adb shell input keyevent KEYCODE_BACK
sleep 1
js 'String(window.__c)'

echo "== print" >> "$OUT/results.txt"
js 'setTimeout(function(){ window.print(); }, 200); "printing"'
cap 07-print 8
adb shell input keyevent KEYCODE_BACK
sleep 3

echo "== UPI link without a UPI app" >> "$OUT/results.txt"
js 'setTimeout(function(){ location.href = "upi://pay?pa=test@upi&pn=Test&am=1"; }, 200); "upi"'
cap 08-upi 3

open_url "https://pakkabill1.vercel.app/#/pnl"
cap 09-pnl 15
echo "== P&L frame" >> "$OUT/results.txt"
js '(function(){var f=document.querySelector(".pnl-frame"); if(!f) return "no frame"; var d=f.contentDocument, w=f.contentWindow; return JSON.stringify({src:f.src, h:f.clientHeight, w:f.clientWidth, css:getComputedStyle(f).height, inner:innerHeight, vv:visualViewport&&visualViewport.height, ready:d&&d.readyState, errors:w&&w.__pbErrors, top:window.__pbErrors, ua:navigator.userAgent.slice(-60)});})()'
echo "== P&L sample and Excel download" >> "$OUT/results.txt"
js '(function(){var d=document.querySelector(".pnl-frame").contentDocument; var b=d.querySelector("[data-act=demo]"); if(!b) return "no demo button"; b.click(); return "demo";})()'
sleep 6
js '(function(){var d=document.querySelector(".pnl-frame").contentDocument; var b=d.querySelector("[data-act=xlsx]"); if(!b) return "no excel button"; b.click(); return "excel";})()'
cap 09b-pnl-excel 8
adb shell ls -la /sdcard/Download/PakkaBill/ 2>&1 | tee -a "$OUT/results.txt"
open_url "https://pakkabill1.vercel.app/#/app"
cap 10-get-app 8

echo "== native settings" >> "$OUT/results.txt"
js 'PakkaBillApp.settings(); "opened"'
cap 11-settings 4
adb shell input keyevent KEYCODE_BACK
cap 12-back-from-settings 3

adb shell cmd uimode night yes
cap 13-dark 8
adb shell cmd uimode night no
sleep 3

adb shell input keyevent KEYCODE_BACK
cap 14-back-history 3

adb shell dumpsys activity activities | grep -E "ResumedActivity" > "$OUT/activity.txt"
adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "pakkabill|chromium|AndroidRuntime|FATAL|WebView" "$OUT/logcat-full.txt" | tail -400 > "$OUT/logcat.txt"
exit 0
