import json
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    print(json.dumps({'buttons': page.locator('button').all_text_contents(), 'errors': errors}))
    page.locator('#modal-btn-pc').click()
    page.mouse.move(720, 450)
    page.screenshot(path=str(Path(__file__).parent / 'baseline.png'))
    page.locator('#btn-select').click()
    page.wait_for_timeout(1200)
    print(json.dumps({'experience': page.locator('#experience-title').text_content(), 'errors': errors}))
    browser.close()
