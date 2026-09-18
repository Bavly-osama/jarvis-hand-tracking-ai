from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',args=['--enable-webgl','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' and ('THREE' in m.text or 'shader' in m.text) else None)
    page.add_init_script('''const raf = window.requestAnimationFrame.bind(window); let pending=[];
      window.requestAnimationFrame = cb => raf(t=> { if(window.freezeVisual) pending.push(cb); else cb(t); });
      window.resumeVisual=()=>{window.freezeVisual=false;pending.splice(0).forEach(cb=>raf(cb));};''')
    page.goto('http://127.0.0.1:5173',wait_until='networkidle',timeout=30000)
    page.locator('#app-container canvas').wait_for()
    page.screenshot(path='client/artifacts/startup.png')
    page.locator('#modal-btn-pc').click()
    page.wait_for_timeout(1200)
    assert 'MOUSE' in page.locator('#status-bar').inner_text()
    page.evaluate('window.freezeVisual=true;document.querySelector("#app-container").style.pointerEvents="none"')
    page.wait_for_timeout(100)
    page.screenshot(path='client/artifacts/desktop.png')
    page.evaluate('window.resumeVisual();document.querySelector("#app-container").style.pointerEvents=""')
    page.locator('#btn-next').click()
    page.wait_for_timeout(1000)
    page.screenshot(path='client/artifacts/next-module.png')
    page.locator('#btn-prev').click()
    page.locator('#btn-select').click()
    page.locator('#btn-zoom').click()
    page.wait_for_timeout(800)
    page.screenshot(path='client/artifacts/zoom.png')
    results=page.evaluate('''async()=>{
      const {CarouselController}=await import('/src/three/CarouselController.ts');
      const {GlobeController}=await import('/src/three/GlobeController.ts');
      const c=new CarouselController();const g=new GlobeController();
      for(let i=0;i<90;i++) c.update(1/60,i/60);
      const before=c.getCards()[0].group.position.clone();
      c.selectCard(3);await new Promise(r=>setTimeout(r,650));
      for(let i=0;i<90;i++) c.update(1/60,i/60);
      g.applyZoom(1.6);for(let i=0;i<90;i++)g.update(1/60,i/60);
      const result={active:c.getActiveCard(),cards:c.getCards().length,zoom:g.group.scale.x,
      finite:c.getCards().every(k=>Number.isFinite(k.group.position.x)&&Number.isFinite(k.group.position.z)),
      selectedForward:c.getCards()[3].group.position.z>2.5,depth:Math.max(...c.getCards().map(k=>k.group.position.z))-Math.min(...c.getCards().map(k=>k.group.position.z))};
      return result;
    }''')
    assert results['active']==3 and results['cards']==10 and results['finite'] and results['selectedForward']
    assert abs(results['zoom']-1.6)<.01 and results['depth']>4
    page.set_viewport_size({'width':390,'height':844})
    page.reload(wait_until='networkidle')
    page.locator('#modal-btn-pc').click()
    page.wait_for_timeout(1200)
    page.screenshot(path='client/artifacts/mobile.png')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    for name in ['btn-prev','btn-next','btn-select','btn-zoom']:
      box=page.locator('#'+name).bounding_box()
      assert box and box['x']>=0 and box['x']+box['width']<=390
    page.emulate_media(reduced_motion='reduce')
    assert page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')
    assert not errors,errors
    report={'render_errors':errors,'checks':results,'portrait_controls':'all inside viewport','protected_interactions':'selection and zoom APIs exercised'}
    open('client/artifacts/verification.json','w').write(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)
    browser.close()
