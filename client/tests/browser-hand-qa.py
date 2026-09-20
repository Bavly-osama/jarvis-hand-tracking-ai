import json, os
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
    page.wait_for_timeout(400)
    results=page.evaluate('''async () => {
      const {hand,trajectories}=await import('/tests/hand-fixtures.mjs');
      const api=window.__handTest, wait=ms=>new Promise(r=>setTimeout(r,ms));
      const feed=async(hands)=>{await wait(34);return api.feed({hands,space:'logical',timestamp:performance.now()});};
      const two=(d)=>[hand(.5-d/2),{...hand(.5+d/2),handedness:'LEFT'}];
      const report=[];
      const check=(name,ok,data)=>{report.push({name,ok,data});};

      const stage=document.getElementById('app-container');
      const video=document.querySelector('video.camera-feed, #input_video');
      stage.classList.add('camera-live');
      const cs=getComputedStyle(video);
      const matrix=new DOMMatrix(cs.transform);
      check('camera full stage',video.clientWidth>=innerWidth*0.9&&video.clientHeight>=innerHeight*0.9,{w:video.clientWidth,h:video.clientHeight});
      check('camera mirrored once',Math.abs(matrix.a+1)<.01,{a:matrix.a});
      check('camera visible in live mode',parseFloat(cs.opacity)>=0.4,{opacity:cs.opacity});
      stage.classList.remove('camera-live');

      for(const [name,sign]of [['slowRight',1],['fastRight',1]]){
        api.reset();await wait(200);
        const before=api.snapshot();let dx=0;
        for(const x of trajectories[name]){const r=await feed([hand(x)]);dx+=r.dragDelta.x;}
        const after=api.snapshot();
        check('TEST '+name,dx*sign>0&&Math.abs(after.angle-before.angle)<1.2,{dx,before:before.angle,after:after.angle});
      }
      api.reset();await wait(200);
      const spike=[];
      for(const x of trajectories.spike)spike.push((await feed([hand(x)])).dragDelta.x);
      check('TEST 3 spike',Math.abs(spike[3])<0.02,{spike});

      api.reset();await wait(200);await feed([hand(.4)]);await feed([hand(.47)]);
      await feed([]);await feed([]);
      const recovered=await feed([hand(.47)]);
      check('TEST 4 temp loss',recovered.dragDelta.x===0&&recovered.clickTarget==null,recovered.dragDelta);

      api.reset();await wait(200);
      const target=api.snapshot().cards.find(c=>c.id==='card-'+api.snapshot().index);
      const x=target.x+.055,y=target.y+.2;
      for(let i=0;i<8;i++)await feed([hand(x,y,1,'point')]);
      const beforeClicks=api.snapshot().clicks;
      for(let i=0;i<20;i++)await feed([hand(x,y,.08,'point')]);
      check('TEST 5 pinch one click',api.snapshot().clicks-beforeClicks===1&&['CARD_OPENING','EXPERIENCE_ACTIVE'].includes(api.snapshot().uiState),api.snapshot());
      for(let i=0;i<Math.ceil(2000/34);i++)await feed([hand(x,y,.08,'point')]);
      check('TEST 6 hold pinch',api.snapshot().clicks-beforeClicks===1);
      await wait(900);

      const back=document.querySelector('#experience-back').getBoundingClientRect();
      const bx=(back.left+back.width/2)/innerWidth+.055,by=(back.top+back.height/2)/innerHeight+.2;
      for(let i=0;i<8;i++)await feed([hand(bx,by,1)]);
      for(let i=0;i<16;i++)await feed([hand(bx,by,.08)]);
      await wait(850);
      check('pinch back button',api.snapshot().uiState==='MAIN_CAROUSEL',{state:api.snapshot().uiState});

      api.reset();await wait(200);
      let clicks=0,drag=false;
      for(let i=0;i<8;i++)await feed([hand()]);
      for(let i=0;i<20;i++){const r=await feed([hand(.5+i*.012,.5,.08)]);clicks+=Number(!!r.clickTarget);drag||=r.state==='DRAG';}
      check('TEST 8 drag vs click',drag&&clicks===0,{clicks,drag});

      api.reset();await wait(200);
      let scales=[];
      for(let i=0;i<6;i++)await feed(two(.20));
      for(const d of trajectories.zoomInSpec){await feed(two(d));scales.push(api.snapshot().scale);}
      check('TEST 9 zoom in',scales.filter(s=>s>1).length>=2&&scales.at(-1)>1.1,scales);
      scales=[];
      for(const d of trajectories.zoomOutSpec){await feed(two(d));scales.push(api.snapshot().scale);}
      check('TEST 10 zoom out',scales.at(-1)<scales[0]-.05,scales);
      api.reset();await wait(200);
      for(let i=0;i<8;i++)await feed(two(.300));
      const jitter=[];
      for(const d of trajectories.zoomJitter){await feed(two(d));jitter.push(api.snapshot().scale);}
      check('TEST 11 zoom jitter',Math.max(...jitter)-Math.min(...jitter)<0.05,jitter);
      api.reset();await wait(200);
      for(let i=0;i<6;i++)await feed(two(.30));
      const active=(await feed(two(.38)));
      const paused=await feed([hand(.31)]);
      const backZoom=await feed(two(.38));
      check('TEST 12 zoom hand loss',Math.abs((paused.zoom??api.snapshot().scale)-(active.zoom??1))<0.08&&Math.abs((backZoom.zoom??api.snapshot().scale)-(active.zoom??1))<0.1,{active:active.zoom,paused:paused.zoom,back:backZoom.zoom});

      api.reset();await wait(200);
      const shown=await feed([hand(.42,.38)]);
      const pointer=document.getElementById('hand-pointer');
      const snap=api.snapshot();
      check('pointer appears without pinch',!!shown && snap.pointerVisible && pointer && parseFloat(getComputedStyle(pointer).opacity)>0 && snap.pointerState!=='LOST',{state:snap.pointerState,opacity:pointer&&getComputedStyle(pointer).opacity,xy:snap.pointerXY});
      await wait(70);
      check('pointer holds brief loss',api.snapshot().pointerVisible,api.snapshot().pointerState);
      await wait(420);
      check('pointer hides after 400ms',!api.snapshot().pointerVisible,{state:api.snapshot().pointerState});

      return report;
    }''')
    page.screenshot(path=str(ROOT/'hand-qa-desktop.png'))
    for width,height in [(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(800)
        layout=page.evaluate('({overflow:document.documentElement.scrollWidth>innerWidth+1, canvas:!!document.querySelector("canvas")})')
        snap=page.evaluate('window.__handTest.snapshot()')
        results.append({'name':f'layout {width}x{height}','ok':not layout['overflow'] and layout['canvas'],'data':layout})
        results.append({'name':f'mobile metrics {width}x{height}','ok':True,'data':{'profile':snap.get('profile'),'pixelRatio':snap.get('pixelRatio'),'fps':snap.get('fps'),'draw':snap.get('draw'),'tracking':snap.get('tracking')}})
        page.screenshot(path=str(ROOT/f'hand-qa-{width}.png'))
    results.append({'name':'uncaught exceptions','ok':not errors,'data':errors})
    (ROOT/'qa-results.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results,indent=2))
    browser.close()
    assert all(r['ok'] for r in results),'Browser acceptance failures; see qa-results.json'
