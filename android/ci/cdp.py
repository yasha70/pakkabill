"""Runs JavaScript inside the app's WebView through Chrome DevTools (debug builds only).
Usage: python3 cdp.py '<js expression>'   -> prints the JSON result."""
import json, sys, urllib.request
import websocket  # pip install websocket-client

pages = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
page = next((p for p in pages if 'pakkabill' in p.get('url', '')), pages[0])
ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=60, suppress_origin=True)
ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {
    'expression': sys.argv[1], 'awaitPromise': True, 'returnByValue': True, 'userGesture': True}}))
while True:
    msg = json.loads(ws.recv())
    if msg.get('id') == 1:
        res = msg.get('result', {})
        print(json.dumps(res.get('result', {}).get('value', res.get('exceptionDetails', res))))
        break
