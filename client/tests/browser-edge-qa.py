import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('QA_BROWSER','msedge'))
    for name,setup in [
      ('camera denied',"navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')};"),
      ('camera disconnected',"navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('missing','NotFoundError')};"),
      ('camera busy',"navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('busy','NotReadableError')};"),
    ]:
        page=browser.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script(setup)
        page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
        page.locator('#modal-btn-camera').click()
        page.locator('#camera-state-overlay button').first.wait_for()
        text=page.locator('#camera-state-overlay').inner_text()
        page.get_by_role('button',name='SWITCH TO MOUSE & TOUCH',exact=True).click()
        page.locator('#btn-select').click();page.wait_for_timeout(1000)
        ok=page.locator('#experience-title').inner_text()=='Earth' and not errors
        results.append({'name':name+' recovers to pointer','ok':ok,'message':text,'errors':errors});page.close()
    page=browser.new_page();page.route('**/@mediapipe/hands@*/hands.js',lambda r:r.abort())
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    page.locator('#modal-btn-camera').click();page.locator('#camera-state-overlay button').first.wait_for()
    results.append({'name':'MediaPipe script unavailable','ok':'Webcam Not Accessible' in page.locator('#camera-state-overlay').inner_text()});page.close()
    browser.close()
Path(__file__).with_name('qa-results-edge.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
assert all(r['ok'] for r in results)
