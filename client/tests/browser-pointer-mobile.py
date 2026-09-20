import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('QA_BROWSER','msedge'))
    context=browser.new_context(permissions=['camera'])
    page=context.new_page()
    page.set_viewport_size({'width':1440,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.wait_for_function('window.__handTest')
    page.locator('#modal-btn-pc').click()
    page.wait_for_timeout(300)
    report=[]
    def check(name,ok,data=None):
        report.append({'name':name,'ok':bool(ok),'data':data})

    page.evaluate('''async () => {
      const {hand}=await import('/tests/hand-fixtures.mjs');
      window.__handTest.reset();
      window.__handTest.feed({hands:[hand(.4,.35)],space:'logical',timestamp:performance.now()});
    }''')
    page.wait_for_timeout(50)
    snap=page.evaluate('window.__handTest.snapshot()')
    opacity=page.evaluate('parseFloat(getComputedStyle(document.getElementById("hand-pointer")).opacity)')
    check('pointer visible on first hand sample', snap['pointerVisible'] and opacity>0, {'state':snap['pointerState'],'opacity':opacity,'xy':snap['pointerXY'],'cursor3d':snap['cursorVisible']})

    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(1000)
    mobile=page.evaluate('window.__handTest.snapshot()')
    check('phone viewport selects MOBILE', mobile.get('profile')=='MOBILE', {'profile':mobile.get('profile'),'pixelRatio':mobile.get('pixelRatio'),'fps':mobile.get('fps'),'draw':mobile.get('draw'),'tracking':mobile.get('tracking')})

    page.set_viewport_size({'width':844,'height':390})
    page.wait_for_timeout(700)
    rotated=page.evaluate('window.__handTest.snapshot()')
    page.evaluate('''async () => {
      const {hand}=await import('/tests/hand-fixtures.mjs');
      window.__handTest.feed({hands:[hand(.3,.4)],space:'logical',timestamp:performance.now()});
    }''')
    page.wait_for_timeout(50)
    aligned=page.evaluate('window.__handTest.snapshot()')
    check('landscape still MOBILE and pointer maps', rotated.get('profile')=='MOBILE' and aligned['pointerVisible'], {'profile':rotated.get('profile'),'fps':rotated.get('fps'),'xy':aligned.get('pointerXY')})

    camera={'started':False,'error':None,'metrics':None}
    try:
        page.locator('#btn-mode-camera').click()
        page.wait_for_timeout(2500)
        camera=page.evaluate('''() => {
          const s=window.__handTest.snapshot();
          const overlay=document.getElementById('camera-state-overlay') || document.querySelector('[data-camera-state]');
          return {started:document.body.classList.contains('camera-live'), tracking:s.tracking, pointerVisible:s.pointerVisible, fps:s.fps, overlay:overlay && overlay.textContent};
        }''')
    except Exception as e:
        camera={'started':False,'error':str(e)}
    check('live camera attempted', True, camera)

    check('uncaught exceptions', not errors, errors)
    (ROOT/'qa-pointer-mobile.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    browser.close()
    assert all(r['ok'] for r in report),'pointer/mobile QA failed'
