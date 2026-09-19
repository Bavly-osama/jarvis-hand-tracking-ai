import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('QA_BROWSER','msedge'))
    page=browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    page.wait_for_function('window.__handTest');page.locator('#modal-btn-pc').click()
    cdp=page.context.new_cdp_session(page)
    cdp.send('HeapProfiler.collectGarbage')
    initial=cdp.send('Runtime.getHeapUsage')
    runs=[]
    for segment in range(6):
        data=page.evaluate('''async () => {
          const {hand}=await import('/tests/hand-fixtures.mjs');
          const api=window.__handTest,start=performance.now();
          let last=start,lastInput=start,count=0;const frames=[],cost=[];
          await new Promise(resolve=>{
            const frame=now=>{
              frames.push(now-last);last=now;
              if(now-lastInput>=33){
                const t=(now-start)/1000;
                const hands=Math.floor(t/5)%2 ? [hand(.35-.08*Math.sin(t)),hand(.65+.08*Math.sin(t))] : [hand(.5+.12*Math.sin(t*1.2))];
                const begin=performance.now();api.feed({hands,space:'logical',timestamp:now});cost.push(performance.now()-begin);lastInput=now;count++;
              }
              if(now-start>=30000)resolve();else requestAnimationFrame(frame);
            };requestAnimationFrame(frame);
          });
          const percentile=(arr,p)=>arr.sort((a,b)=>a-b)[Math.floor((arr.length-1)*p)];
          return {elapsedMs:performance.now()-start,renderFPS:frames.length/30,inputCount:count,
            renderMedianMs:percentile(frames,.5),renderP95Ms:percentile(frames,.95),
            pipelineMedianMs:percentile(cost,.5),pipelineP95Ms:percentile(cost,.95),snapshot:api.snapshot()};
        }''')
        cdp.send('HeapProfiler.collectGarbage');data['heap']=cdp.send('Runtime.getHeapUsage')
        data['snapshot'].pop('cards',None)
        runs.append(data);print(json.dumps({'segment':segment+1,**data}),flush=True)
    result={'initialHeap':initial,'segments':runs,'errors':errors}
    Path(__file__).with_name('qa-results-soak.json').write_text(json.dumps(result,indent=2))
    assert not errors,errors
    assert all(r['snapshot']['historySize']<=64 and r['snapshot']['aiPending']<=1 for r in runs)
    browser.close()
