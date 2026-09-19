import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('QA_BROWSER','msedge'))
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m: print('CONSOLE:',m.text) if m.type=='error' and 'WebSocket' not in m.text else None)
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.wait_for_function('window.__handTest')
    page.locator('#modal-btn-pc').click()
    page.wait_for_timeout(500)
    results=page.evaluate('''async () => {
      const {hand,trajectories}=await import('/tests/hand-fixtures.mjs');
      const api=window.__handTest, wait=ms=>new Promise(r=>setTimeout(r,ms));
      const feed=async(hands)=>{await wait(34);return api.feed({hands,space:'logical',timestamp:performance.now()});};
      const report=[];
      const check=(name,ok,data)=>{report.push({name,ok,data});};
      for(const [name,sign]of [['moveRight',1],['moveLeft',-1]]){
        api.reset();await wait(350);
        const before=api.snapshot();
        for(const x of trajectories[name])await feed([hand(x)]);
        await wait(70);const after=api.snapshot();
        check(name,(after.angle-before.angle)*sign<-.05,{before:before.angle,after:after.angle});
      }
      api.reset();await wait(350);const start=api.snapshot();
      for(let i=0;i<5;i++)for(const x of trajectories.jitter)await feed([hand(x)]);
      check('jitter',Math.abs(api.snapshot().angle-start.angle)<.001);
      api.reset();await wait(350);
      const target=api.snapshot().cards.find(c=>c.id==='card-'+api.snapshot().index);
      const x=target.x+.055,y=target.y+.2;
      check('exact target',api.hitTest(target.x,target.y)===target.id,{target});
      for(let i=0;i<8;i++)await feed([hand(x,y,1,'point')]);
      const beforeClicks=api.snapshot().clicks;
      for(let i=0;i<38;i++)await feed([hand(x,y,.08,'point')]);
      check('pinch opens one target',api.snapshot().clicks-beforeClicks===1&&api.snapshot().uiState==='EXPERIENCE_ACTIVE',api.snapshot());
      // Hold through opening: no repeated game/action activation.
      for(let i=0;i<15;i++)await feed([hand(x,y,.08,'point')]);
      check('held pinch remains single click',api.snapshot().clicks-beforeClicks===1);
      const back=document.querySelector('#experience-back').getBoundingClientRect();
      const bx=(back.left+back.width/2)/innerWidth+.055,by=(back.top+back.height/2)/innerHeight+.2;
      for(let i=0;i<10;i++)await feed([hand(bx,by,1,'point')]);
      for(let i=0;i<15;i++)await feed([hand(bx,by,.08,'point')]);
      await wait(850);check('pinch back button',api.snapshot().uiState==='MAIN_CAROUSEL',api.snapshot());
      api.reset();await wait(350);
      let scales=[];
      for(const d of trajectories.zoomIn){await feed([hand(.5-d/2),hand(.5+d/2)]);scales.push(api.snapshot().scale);}
      check('continuous zoom in',scales.every((s,i)=>!i||s>=scales[i-1])&&scales.at(-1)>1.25,scales);
      for(let i=0;i<10;i++)await feed([]);
      scales=[];
      for(const d of trajectories.zoomOut){await feed([hand(.5-d/2),hand(.5+d/2)]);scales.push(api.snapshot().scale);}
      check('continuous zoom out',scales.every((s,i)=>!i||s<=scales[i-1])&&scales.at(-1)<scales[0]-.15,scales);
      api.reset();await wait(350);await feed([hand(.4)]);await feed([hand(.47)]);
      await feed([]);await feed([]);const angle=api.snapshot().angle;
      const recovery=await feed([hand(.8)]);
      check('loss reanchors',recovery.dragDelta.x===0&&Math.abs(api.snapshot().angle-angle)<.001,recovery.dragDelta);
      const clicks=api.snapshot().clicks;
      for(let i=0;i<20;i++)await feed([{...hand(.5,.5,.05),quality:.2}]);
      check('low quality never clicks',api.snapshot().clicks===clicks);
      return report;
    }''')
    page.screenshot(path=str(ROOT/'hand-qa-desktop.png'))
    for width,height in [(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(400)
        layout=page.evaluate('({overflow:document.documentElement.scrollWidth>innerWidth+1, canvas:!!document.querySelector("canvas")})')
        results.append({'name':f'layout {width}x{height}','ok':not layout['overflow'] and layout['canvas'],'data':layout})
        page.screenshot(path=str(ROOT/f'hand-qa-{width}.png'))
    results.append({'name':'uncaught exceptions','ok':not errors,'data':errors})
    (ROOT/'qa-results.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results,indent=2))
    browser.close()
    assert all(r['ok'] for r in results),'Browser acceptance failures; see qa-results.json'
