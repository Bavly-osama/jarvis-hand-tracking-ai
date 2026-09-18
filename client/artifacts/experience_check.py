from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',args=['--enable-webgl','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' and ('THREE' in m.text or 'shader' in m.text) else None)
    page.goto('http://127.0.0.1:5173',wait_until='networkidle')
    page.locator('#modal-btn-pc').click()
    page.wait_for_timeout(1200)
    reports=[]
    names=['Earth','Game','Analytics','System','AI','Energy','Network','Security','Files','Navigation']
    for index,name in enumerate(names):
        if index:page.locator('#btn-next').click();page.wait_for_timeout(900)
        page.locator('#btn-select').click()
        page.wait_for_timeout(1200)
        page.screenshot(path='client/artifacts/experience-current.png')
        print('opened',name,'actual',page.locator('#experience-title').inner_text(),'errors',errors,flush=True)
        assert page.locator('#experience-title').text_content()==name
        assert page.locator('#experience-back').is_visible()
        assert not page.locator('#touch-nav').is_visible()
        if name=='AI':page.locator('#ai-command').fill('status');page.locator('#experience-command button').click();page.wait_for_timeout(2500)
        elif name=='Game':
            page.mouse.move(820,390);page.mouse.click(820,390);page.wait_for_timeout(400)
        else:page.locator('#experience-action').click();page.wait_for_timeout(200)
        if name=='System':page.wait_for_timeout(2300)
        if name=='Files':page.locator('#experience-action').click()
        if name in ['Game','Analytics','Files','AI','Energy']:page.screenshot(path=f'client/artifacts/experience-{name.lower()}.png')
        reports.append({'module':name,'readout':page.locator('#experience-readout').inner_text(),'result':page.locator('#experience-detail').inner_text()})
        page.locator('#experience-next').click()
        page.locator('#experience-zoom').click()
        page.locator('#experience-back').click()
        page.wait_for_timeout(950)
        assert not page.locator('.experience-panel').is_visible()
        assert page.locator('#touch-nav').is_visible()
    # One long drag right wraps from Navigation to Files; a second drag after release to Security.
    page.mouse.move(360,490);page.mouse.down();page.mouse.move(650,490,steps=30);page.wait_for_timeout(1000);page.mouse.move(1000,490,steps=30);page.mouse.up();page.wait_for_timeout(900)
    page.locator('#btn-select').click();page.wait_for_timeout(1100)
    assert page.locator('#experience-title').text_content()=='Files'
    page.locator('#experience-back').click();page.wait_for_timeout(900)
    page.mouse.move(360,490);page.mouse.down();page.mouse.move(1050,490,steps=2);page.mouse.up();page.wait_for_timeout(900)
    page.locator('#btn-select').click();page.wait_for_timeout(1100)
    assert page.locator('#experience-title').text_content()=='Security'
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(800)
    page.screenshot(path='client/artifacts/experience-mobile.png')
    for id in ['experience-back','experience-action']:
        box=page.locator('#'+id).bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=390
    page.keyboard.press('Escape');page.wait_for_timeout(900)
    assert not page.locator('.experience-panel').is_visible()
    assert not errors,errors
    result={'modules':reports,'long_drag':'one slot','fast_drag_after_release':'one slot','render_errors':errors,'mobile_exit':'passed'}
    open('client/artifacts/experience-verification.json','w').write(json.dumps(result,indent=2))
    print(json.dumps(result),flush=True)
    browser.close()

